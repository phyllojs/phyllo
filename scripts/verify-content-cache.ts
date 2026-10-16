import {
  mkdir,
  mkdtemp,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createBuild } from '../packages/core/src/build';
import {
  type CompiledContent,
  createCompiler,
} from '../packages/core/src/content/compile';
import { dev } from '../packages/core/src/dev';

import { verifyProject } from './verify-project';

/**
 * 验证引用资源与配置变化时编译器会重新编译，未变化时复用缓存：
 *
 * - 资源内容变化与链接目标切换都会重新编译；
 * - 链接改指向输出目录时，复用与全新编译都必须报错；
 * - 新旧目标内容相同但新目标位于输出目录时仍执行校验；
 * - 配置读取的外部文件变化时，复用与全新构建使用同一份新配置值，
 *   配置与内容都未变化时仍复用编译器。
 *
 * 需要真实文件读写，按项目规范放在独立脚本中执行。
 */
const root = await realpath(
  await mkdtemp(join(tmpdir(), 'phyllo-content-cache-')),
);
const content = join(root, 'content');
const distSource = join(root, 'dist/source');

/**
 * 断言编译以输出目录冲突报错。
 *
 * @param name - 断言对象名称。
 * @param result - 待检查的编译结果。
 * @throws 未报错或信息不符时抛出错误。
 */
async function expectOutdirError(
  name: string,
  result: Promise<CompiledContent>,
) {
  try {
    await result;
  } catch (error) {
    if (String(error).includes('must not be inside the output directory')) {
      return;
    }
    throw new Error(`${name}报错不符：${String(error)}`, { cause: error });
  }
  throw new Error(`${name}未报错`);
}

/**
 * 轮询等待页面包含标记。
 *
 * @param server - 开发服务实例。
 * @param marker - 页面中必须出现的标记。
 * @returns 包含标记的页面 HTML。
 * @throws 超时仍未包含时抛出错误。
 */
async function waitForPage(
  server: Awaited<ReturnType<typeof dev>>,
  marker: string,
) {
  const signal = AbortSignal.timeout(20_000);

  let last: string;

  for (;;) {
    try {
      const page = await (
        await fetch(new URL('/', server.url), { signal })
      ).text();

      if (page.includes(marker)) {
        return page;
      }
      last = '缺少标记';
    } catch (error) {
      last = String(error);
    }

    if (signal.aborted) {
      throw new Error(`页面未在时限内包含 ${marker}：${last}`);
    }
    await Bun.sleep(200);
  }
}

try {
  await mkdir(content, { recursive: true });

  // 资源内容变化：重新编译。
  const page = join(content, 'page.mdx');
  const image = join(content, 'pic.svg');

  await writeFile(page, '![pic](./pic.svg)\n');
  await writeFile(image, '<svg><!--a--></svg>');

  const project = verifyProject(root);
  const compile = createCompiler(project);
  const first = await compile(page);
  const [firstPath] = [...first.assets.keys()];

  if (firstPath === undefined) {
    throw new Error('The page asset was not collected.');
  }

  if ((await compile(page)) !== first) {
    throw new Error('Unchanged source and asset should reuse the cache.');
  }

  await writeFile(image, '<svg><!--b--></svg>');

  const updated = await compile(page);
  const [updatedPath] = [...updated.assets.keys()];

  if (updated === first || updatedPath === firstPath) {
    throw new Error('Changed asset should invalidate the compile cache.');
  }

  // 链接目标切换：复用与全新编译产出相同的新资源。
  const mediaOld = join(root, 'media-old');
  const mediaNew = join(root, 'media-new');
  const mediaLink = join(content, 'media');
  const linkedPage = join(content, 'linked.mdx');

  await mkdir(mediaOld, { recursive: true });
  await mkdir(mediaNew, { recursive: true });
  await writeFile(join(mediaOld, 'pic.svg'), '<svg><!--old--></svg>');
  await writeFile(join(mediaNew, 'pic.svg'), '<svg><!--new--></svg>');
  await symlink(mediaOld, mediaLink);
  await writeFile(linkedPage, '![pic](./media/pic.svg)\n');

  const linked = await compile(linkedPage);
  const [linkedPath] = [...linked.assets.keys()];

  await rm(mediaLink, { force: true });
  await symlink(mediaNew, mediaLink);

  const reused = await compile(linkedPage);
  const [reusedPath] = [...reused.assets.keys()];
  const fresh = await createCompiler(project)(linkedPage);
  const [freshPath] = [...fresh.assets.keys()];

  if (reused === linked || reusedPath === linkedPath) {
    throw new Error(
      'Repointed asset link should invalidate the compile cache.',
    );
  }

  if (reusedPath !== freshPath) {
    throw new Error('Reused and fresh builds should use the same asset.');
  }

  // 链接改指向输出目录：复用与全新编译都报错。
  await mkdir(distSource, { recursive: true });
  await writeFile(join(distSource, 'pic.svg'), '<svg><!--old--></svg>');
  await rm(mediaLink, { force: true });
  await symlink(distSource, mediaLink);

  await expectOutdirError('复用编译', compile(linkedPage));
  await expectOutdirError('全新编译', createCompiler(project)(linkedPage));

  // 新旧目标内容相同但新目标位于输出目录：仍执行校验。
  await writeFile(join(distSource, 'pic.svg'), '<svg><!--new--></svg>');
  await expectOutdirError('相同内容的输出目录目标', compile(linkedPage));

  // 配置值变化：复用与全新构建使用同一份新配置。
  const site = join(root, 'config-site');
  const options = join(site, 'options.json');
  const resources = { styles: [], scripts: [], head: [] };

  await mkdir(join(site, 'content'), { recursive: true });

  await writeFile(
    join(site, 'content/index.mdx'),
    '```js\nconst highlighted = 1;\n```\n',
  );

  await writeFile(
    options,
    JSON.stringify({ title: 'TITLE_ONE', highlight: false, search: false }),
  );

  await writeFile(
    join(site, 'phyllo.config.ts'),
    [
      "import { defineConfig } from '@phyllo/core';",
      '',
      `const options = await Bun.file(${JSON.stringify(options)}).json();`,
      '',
      'export default defineConfig({',
      "  theme: 'phyllo-theme-docs',",
      '  title: options.title,',
      '  search: options.search,',
      '  markdown: { highlight: options.highlight },',
      '});',
      '',
    ].join('\n'),
  );

  await symlink(
    join(import.meta.dir, '../docs/node_modules'),
    join(site, 'node_modules'),
  );

  const initialBuild = await createBuild(site, { development: true });
  const initialHtml = await initialBuild.render('/', resources);

  if (
    !initialHtml.includes('TITLE_ONE') ||
    initialHtml.includes('class="shiki')
  ) {
    throw new Error('初始构建未按配置值渲染标题与高亮。');
  }

  if (initialBuild.files.has('_phyllo/search.json')) {
    throw new Error('搜索关闭时不应生成索引。');
  }

  await writeFile(
    options,
    JSON.stringify({ title: 'TITLE_TWO', highlight: true, search: true }),
  );

  const reusedBuild = await createBuild(site, {
    development: true,
    previous: initialBuild,
  });
  const freshBuild = await createBuild(site, { development: true });

  if (reusedBuild.compile === initialBuild.compile) {
    throw new Error('配置值变化后不应复用编译器。');
  }

  const searchCount = async (build: typeof reusedBuild) => {
    const index = build.files.get('_phyllo/search.json');

    if (index === undefined) {
      return 0;
    }
    const text = index instanceof Blob ? await index.text() : index;

    return (JSON.parse(text) as unknown[]).length;
  };

  for (const [name, build] of [
    ['复用构建', reusedBuild],
    ['全新构建', freshBuild],
  ] as const) {
    const html = await build.render('/', resources);

    if (!html.includes('TITLE_TWO') || !html.includes('class="shiki')) {
      throw new Error(`${name}未使用新的配置值。`);
    }

    if ((await searchCount(build)) < 1) {
      throw new Error(`${name}未按新的搜索配置生成索引。`);
    }
  }

  if ((await searchCount(reusedBuild)) !== (await searchCount(freshBuild))) {
    throw new Error('复用与全新构建的搜索索引不一致。');
  }

  // 配置与内容都未变化时仍复用编译器。
  const cachedBuild = await createBuild(site, {
    development: true,
    previous: reusedBuild,
  });

  if (cachedBuild.compile !== reusedBuild.compile) {
    throw new Error('配置与内容未变化时应复用编译器。');
  }

  // 真实开发服务：修改配置读取的 JSON 后重建使用新值。
  const server = await dev(site, { port: 0 });

  try {
    const page = await (await fetch(new URL('/', server.url))).text();

    if (!page.includes('TITLE_TWO') || !page.includes('class="shiki')) {
      throw new Error('开发服务初始页面未使用配置值。');
    }

    await writeFile(
      options,
      JSON.stringify({ title: 'TITLE_THREE', highlight: false, search: true }),
    );

    const updated = await waitForPage(server, 'TITLE_THREE');

    if (updated.includes('class="shiki')) {
      throw new Error('开发重建未使用新的高亮配置。');
    }
  } finally {
    await server.stop();
  }

  console.log(
    `资源变更与链接目标切换触发重新编译：${firstPath} → ${updatedPath} → ${reusedPath}，配置值变化时重建编译器`,
  );
} finally {
  await rm(root, { recursive: true, force: true });
}
