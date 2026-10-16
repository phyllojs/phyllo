import { file } from 'bun';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { dev } from '../packages/core/src/dev';

/**
 * 验证开发服务在内容出错后的恢复路径。
 *
 * 隐藏片段、目录链接中的隐藏片段与间接配置切换都必须能在只修复片段的情况下
 * 触发重建并恢复，不依赖可见文章的改动。站点通过目录链接启动，同时覆盖符号
 * 链接站点根路径。同一进程中移除导入后的废弃片段改坏时不阻断应用，恢复导入时
 * 错误重新暴露。
 *
 * 需要文件监听、进程协作与真实 HTTP 请求，按项目规范放在独立脚本中执行。
 */
const parent = await mkdtemp(join(tmpdir(), 'phyllo-dev-recovery-'));
const root = join(parent, 'site');
const linked = join(parent, 'linked-site');

type Server = Awaited<ReturnType<typeof dev>>;

/**
 * 写入隐藏片段内容。
 *
 * @param path - 片段路径。
 * @param marker - 片段文本。
 */
function writeFragment(path: string, marker: string) {
  return writeFile(path, `${marker}\n`);
}

/**
 * 写出站点配置，内容目录可切换。
 *
 * @param content - 内容目录名。
 * @returns 配置文件内容。
 */
function settings(content: string, outdir?: string) {
  return [
    "import { defineConfig } from '@phyllo/core';",
    '',
    'export default defineConfig({',
    "  theme: 'phyllo-theme-docs',",
    "  title: 'Probe',",
    "  description: 'Dev probe',",
    `  content: '${content}',`,
    ...(outdir === undefined ? [] : [`  outdir: '${outdir}',`]),
    '});',
    '',
  ].join('\n');
}

/**
 * 轮询请求直到状态码与内容标记符合预期。
 *
 * @param server - 开发服务实例。
 * @param pathname - 请求路径。
 * @param status - 期望的状态码。
 * @param marker - 响应中必须出现的标记，省略时不检查。
 * @returns 符合预期的响应内容。
 * @throws 超时仍不符合预期时抛出错误。
 */
async function waitFor(
  server: Server,
  pathname: string,
  status: number,
  marker?: string,
) {
  // 超时信号覆盖整轮等待，请求挂起时也能中止。
  const signal = AbortSignal.timeout(20_000);

  let last: string;

  for (;;) {
    try {
      const response = await fetch(new URL(pathname, server.url), { signal });
      const body = await response.text();

      if (
        response.status === status &&
        (marker === undefined || body.includes(marker))
      ) {
        return body;
      }
      last = `${response.status}${marker !== undefined && !body.includes(marker) ? `（缺少 ${marker}）` : ''}`;
    } catch (error) {
      last = String(error);
    }

    if (signal.aborted) {
      throw new Error(`${pathname} 未在时限内变为 ${status}：${last}`);
    }
    await Bun.sleep(200);
  }
}

/**
 * 读取开发入口中的构建标识。
 *
 * @returns 当前构建标识。
 * @throws 开发入口缺少构建标识时抛出错误。
 */
async function buildId() {
  const source = await file(join(root, '.phyllo/dev/client.ts')).text();
  const match = /const buildId = "([^"]+)";/.exec(source);

  if (match === null) {
    throw new Error('开发入口缺少构建标识。');
  }
  return match[1]!;
}

/**
 * 轮询构建标识变化，确认一次重建已经完成。
 *
 * @param previous - 上一次的构建标识。
 * @throws 超时仍未变化时抛出错误。
 */
async function waitForBuild(previous: string) {
  const signal = AbortSignal.timeout(20_000);

  for (;;) {
    if ((await buildId()) !== previous) {
      return;
    }

    if (signal.aborted) {
      throw new Error('构建标识未在时限内变化。');
    }
    await Bun.sleep(50);
  }
}

/**
 * 读取页面中的媒体 CSS 地址，按链接顺序返回。
 *
 * @param page - 页面 HTML。
 * @returns 媒体 CSS 地址列表。
 */
function cssUrls(page: string) {
  return [...page.matchAll(/href="(\/_phyllo\/media\/[a-z0-9]+\.css)"/g)].map(
    match => match[1]!,
  );
}

/**
 * 轮询等待指定媒体 CSS 地址更新，并校验未修改文件的地址保持不变。
 *
 * @param server - 开发服务实例。
 * @param before - 修改前的媒体 CSS 地址。
 * @param index - 本次修改文件对应的地址下标。
 * @returns 更新后的地址列表。
 * @throws 未修改文件地址变化或超时仍未更新时抛出错误。
 */
async function waitForCss(
  server: Server,
  before: readonly string[],
  index: number,
) {
  const signal = AbortSignal.timeout(20_000);

  for (;;) {
    let urls: string[] | undefined;

    try {
      const page = await (
        await fetch(new URL('/css-page', server.url), { signal })
      ).text();

      urls = cssUrls(page);
    } catch {
      // 请求失败时继续轮询直到超时。
    }

    if (
      urls !== undefined &&
      urls[index] !== undefined &&
      urls[index] !== before[index]
    ) {
      for (const [other, url] of urls.entries()) {
        if (other !== index && url !== before[other]) {
          throw new Error('未修改的 CSS 媒体地址发生变化。');
        }
      }
      return urls;
    }

    if (signal.aborted) {
      throw new Error('CSS 修改后页面未在时限内更新媒体地址。');
    }
    await Bun.sleep(200);
  }
}

/**
 * 写出站点、隐藏片段与目录链接。
 */
async function writeSite() {
  await mkdir(join(root, 'content/.fragments'), { recursive: true });
  await mkdir(join(root, 'shared/source/.fragments'), { recursive: true });

  await writeFile(
    join(root, 'phyllo.config.ts'),
    "export { default } from './settings.ts';\n",
  );
  await writeFile(join(root, 'settings.ts'), settings('content'));

  await writeFile(
    join(root, 'content/article.mdx'),
    "import Note from './.fragments/note.mdx';\n\n<Note />\n",
  );
  await writeFragment(join(root, 'content/.fragments/note.mdx'), 'PLAIN_ONE');

  await writeFile(
    join(root, 'shared/source/alias.mdx'),
    "import Note from './.fragments/note.mdx';\n\n<Note />\n",
  );

  await writeFragment(
    join(root, 'shared/source/.fragments/note.mdx'),
    'ALIAS_ONE',
  );

  await symlink(join(root, 'shared/source'), join(root, 'content/published'));

  // 链接目录根目录没有文章：祖先映射覆盖隐藏片段的真实位置。
  await mkdir(join(root, 'shared/deep/posts'), { recursive: true });
  await mkdir(join(root, 'shared/deep/.fragments'), { recursive: true });

  await writeFile(
    join(root, 'shared/deep/posts/note-page.mdx'),
    "import Note from '../.fragments/note.mdx';\n\n<Note />\n",
  );

  await writeFragment(
    join(root, 'shared/deep/.fragments/note.mdx'),
    'SIBLING_NOTE_ONE',
  );

  await symlink(join(root, 'shared/deep'), join(root, 'content/sibling'));

  // 工作目录经符号链接指向可见目录：生成文件不触发重复重建。
  await mkdir(join(root, 'cache'), { recursive: true });
  await symlink(join(root, 'cache'), join(root, '.phyllo'));

  // 隐藏目录符号链接：片段按逻辑路径解析链接，改动参与重建。
  await mkdir(join(root, 'shared/.notes'), { recursive: true });

  await writeFile(
    join(root, 'shared/.notes/note.mdx'),
    '[Article](../article.md)\n\nHIDDEN_LINK_ONE\n',
  );
  await symlink(join(root, 'shared/.notes'), join(root, 'content/.notes'));

  await writeFile(
    join(root, 'content/hidden-link.mdx'),
    "import Note from './.notes/note.mdx';\n\n<Note />\n",
  );

  // Markdown 引用的 CSS：普通目录、隐藏目录与目录链接。
  await writeFile(
    join(root, 'content/css-page.mdx'),
    [
      '[Plain CSS](./style-plain.css)',
      '',
      '[Hidden CSS](./.fragments/style-hidden.css)',
      '',
      '[Linked CSS](./published/style-linked.css)',
      '',
    ].join('\n'),
  );
  await writeFile(join(root, 'content/style-plain.css'), '/* plain one */\n');

  await writeFile(
    join(root, 'content/.fragments/style-hidden.css'),
    '/* hidden one */\n',
  );

  await writeFile(
    join(root, 'shared/source/style-linked.css'),
    '/* linked one */\n',
  );

  await symlink(
    join(import.meta.dir, '../docs/node_modules'),
    join(root, 'node_modules'),
  );
}

try {
  await writeSite();
  await symlink(root, linked);

  const first = await dev(linked, { port: 0 });

  try {
    // 配置稳定：隐藏片段改坏再修好。
    await waitFor(first, '/article', 200, 'PLAIN_ONE');

    // 无源码变化时构建标识保持稳定，生成文件不触发重复重建。
    const stable = await buildId();

    for (let index = 0; index < 5; index += 1) {
      await Bun.sleep(200);

      if ((await buildId()) !== stable) {
        throw new Error('无源码变化时构建标识不应变化。');
      }
    }
    await writeFragment(join(root, 'content/.fragments/note.mdx'), '<unclosed');
    await waitFor(first, '/article', 500);
    await writeFragment(join(root, 'content/.fragments/note.mdx'), 'PLAIN_TWO');
    await waitFor(first, '/article', 200, 'PLAIN_TWO');

    // 内容目录之外、经目录链接映射的隐藏片段。
    await waitFor(first, '/published/alias', 200, 'ALIAS_ONE');

    await writeFragment(
      join(root, 'shared/source/.fragments/note.mdx'),
      '<unclosed',
    );
    await waitFor(first, '/published/alias', 500);

    await writeFragment(
      join(root, 'shared/source/.fragments/note.mdx'),
      'ALIAS_TWO',
    );
    await waitFor(first, '/published/alias', 200, 'ALIAS_TWO');

    // 链接目录根目录没有文章时，隐藏片段的修改仍触发重建。
    await waitFor(first, '/sibling/posts/note-page', 200, 'SIBLING_NOTE_ONE');

    await writeFragment(
      join(root, 'shared/deep/.fragments/note.mdx'),
      'SIBLING_NOTE_TWO',
    );
    await waitFor(first, '/sibling/posts/note-page', 200, 'SIBLING_NOTE_TWO');

    // 隐藏目录符号链接中的片段改动触发重建。
    await waitFor(first, '/hidden-link', 200, 'HIDDEN_LINK_ONE');

    await writeFile(
      join(root, 'shared/.notes/note.mdx'),
      '[Article](../article.md)\n\nHIDDEN_LINK_TWO\n',
    );
    await waitFor(first, '/hidden-link', 200, 'HIDDEN_LINK_TWO');

    // Markdown 引用的 CSS：逐个修改，分别验证三种监听范围。
    const cssPage = await waitFor(first, '/css-page', 200, 'Plain CSS');
    const cssFiles = [
      join(root, 'content/style-plain.css'),
      join(root, 'content/.fragments/style-hidden.css'),
      join(root, 'shared/source/style-linked.css'),
    ] as const;

    let cssHrefs = cssUrls(cssPage);

    if (cssHrefs.length !== cssFiles.length) {
      throw new Error('Markdown 引用的 CSS 未生成媒体地址。');
    }

    for (const [index, file] of cssFiles.entries()) {
      await writeFile(file, `/* updated ${index} */\n`);
      cssHrefs = await waitForCss(first, cssHrefs, index);
    }

    // 间接配置切换内容目录，新目录的隐藏片段有错误。
    await mkdir(join(root, 'new-content/.fragments'), { recursive: true });

    await writeFile(
      join(root, 'new-content/article2.mdx'),
      "import Note from './.fragments/note.mdx';\n\n<Note />\n",
    );

    await writeFragment(
      join(root, 'new-content/.fragments/note.mdx'),
      '<unclosed',
    );
    await writeFile(join(root, 'settings.ts'), settings('new-content'));
    await waitFor(first, '/article2', 500);

    await writeFragment(
      join(root, 'new-content/.fragments/note.mdx'),
      'NEW_FIXED',
    );
    await waitFor(first, '/article2', 200, 'NEW_FIXED');
  } finally {
    await first.stop();
  }

  // 启动即失败：只修隐藏片段恢复。
  await writeFragment(
    join(root, 'new-content/.fragments/note.mdx'),
    '<unclosed',
  );

  const second = await dev(linked, { port: 0 });

  try {
    await waitFor(second, '/article2', 500);

    await writeFragment(
      join(root, 'new-content/.fragments/note.mdx'),
      'NEW_AGAIN',
    );
    await waitFor(second, '/article2', 200, 'NEW_AGAIN');
  } finally {
    await second.stop();
  }

  // 废弃片段：同一进程中移除导入后改坏片段源文件不阻断应用，
  // 恢复导入时错误重新暴露，修好后恢复并输出新内容。
  const pagePath = join(root, 'new-content/deprecated.mdx');
  const fragmentPath = join(root, 'new-content/.fragments/dep.mdx');

  await writeFile(
    pagePath,
    "import Note from './.fragments/dep.mdx';\n\n<Note />\n",
  );
  await writeFragment(fragmentPath, 'DEP_ONE');

  const third = await dev(linked, { port: 0 });

  try {
    await waitFor(third, '/deprecated', 200, 'DEP_ONE');

    await writeFile(pagePath, '# Removed\n\nNO_IMPORT\n');
    await waitFor(third, '/deprecated', 200, 'NO_IMPORT');

    const previous = await buildId();

    await writeFragment(fragmentPath, '<unclosed');
    await waitForBuild(previous);
    await waitFor(third, '/deprecated', 200, 'NO_IMPORT');
    await waitFor(third, '/deprecated', 200, 'NO_IMPORT');

    await writeFile(
      pagePath,
      "import Note from './.fragments/dep.mdx';\n\n<Note />\n",
    );
    await waitFor(third, '/deprecated', 500);

    await writeFragment(fragmentPath, 'DEP_TWO');
    await waitFor(third, '/deprecated', 200, 'DEP_TWO');
  } finally {
    await third.stop();
  }

  // 输出目录改为内容目录：编译失败后只修隐藏片段即可恢复。
  await mkdir(join(root, 'dist/.fragments'), { recursive: true });

  await writeFile(
    join(root, 'dist/article3.mdx'),
    "import Note from './.fragments/note.mdx';\n\n<Note />\n",
  );
  await writeFragment(join(root, 'dist/.fragments/note.mdx'), '<unclosed');
  await writeFile(join(root, 'settings.ts'), settings('content'));

  const fourth = await dev(linked, { port: 0 });

  try {
    await waitFor(fourth, '/article', 200, 'PLAIN_TWO');

    await writeFile(join(root, 'settings.ts'), settings('dist', 'new-dist'));
    await waitFor(fourth, '/article3', 500);

    await writeFragment(join(root, 'dist/.fragments/note.mdx'), 'OUTDIR_FIXED');
    await waitFor(fourth, '/article3', 200, 'OUTDIR_FIXED');
  } finally {
    await fourth.stop();
  }

  console.log(
    '开发恢复验证通过：普通目录、链接目录与间接配置切换均可只修隐藏片段恢复，链接目录根目录无文章时隐藏片段改动仍触发重建，隐藏目录符号链接中的片段改动触发重建，输出目录改为内容目录后只修隐藏片段即可恢复，Markdown 引用的 CSS 修改触发重建并更新地址，无源码变化时构建标识保持稳定，移除导入后的废弃片段改坏不阻断应用',
  );
} finally {
  await rm(parent, { recursive: true, force: true });
}
