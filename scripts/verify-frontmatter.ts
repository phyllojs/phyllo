import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { createBuild } from '../packages/core/src/build';
import { loadProject } from '../packages/core/src/config/project';
import { indexContent } from '../packages/core/src/content';
import { createCompiler } from '../packages/core/src/content/compile';

/**
 * 验证 frontmatter 的导出、读取与错误处理：
 *
 * - 正文通过 `{frontmatter.title}` 读取普通字段、连字符键与嵌套字段；
 * - 无 frontmatter、空块与注释块导出空对象；
 * - 片段读取自身字段，`useFrontmatter()` 读取宿主页面；
 * - 用户 remark 插件修改 YAML 后，页面数据与导出一致；
 * - 非对象 frontmatter 与导出名冲突报错；
 * - `.md` 不导出 frontmatter，`.mdx` 导出；
 * - 生成 `.phyllo/mdx.d.ts`。
 *
 * 需要真实构建与主题渲染，按项目规范放在独立脚本中执行。
 */
const root = await mkdtemp(join(tmpdir(), 'phyllo-frontmatter-'));

/**
 * 写出文件，自动创建父目录。
 *
 * @param path - 文件路径。
 * @param source - 文件内容。
 */
async function write(path: string, source: string) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, source);
}

/**
 * 断言文本包含全部片段。
 *
 * @param name - 断言对象名称。
 * @param source - 待检查文本。
 * @param values - 必须出现的片段。
 */
function expectIncludes(
  name: string,
  source: string,
  values: readonly string[],
) {
  for (const value of values) {
    if (!source.includes(value)) {
      throw new Error(`${name}缺少：${value}`);
    }
  }
}

/**
 * 取构建产物中的页面 HTML。
 *
 * @param build - 站点构建结果。
 * @param url - 页面地址。
 * @returns 页面 HTML。
 * @throws 页面没有产物时抛出错误。
 */
function pageHtml(build: Awaited<ReturnType<typeof createBuild>>, url: string) {
  const filename = build.routes.get(url);
  const value = filename === undefined ? undefined : build.files.get(filename);

  if (typeof value !== 'string') {
    throw new Error(`页面缺少产物：${url}`);
  }
  return value;
}

/**
 * 断言构建失败且错误信息包含片段。
 *
 * @param name - 断言对象名称。
 * @param expected - 错误信息必须包含的片段。
 * @throws 未报错或信息不符时抛出错误。
 */
async function expectBuildError(name: string, expected: string) {
  try {
    await createBuild(root);
  } catch (error) {
    if (!String(error).includes(expected)) {
      throw new Error(`${name}报错不符：${String(error)}`, { cause: error });
    }
    return;
  }
  throw new Error(`${name}未报错`);
}

try {
  await write(
    join(root, 'phyllo.config.ts'),
    [
      "import { defineConfig } from '@phyllo/core';",
      "import plugin from './plugin';",
      '',
      'export default defineConfig({',
      "  theme: 'phyllo-theme-docs',",
      "  title: 'Probe',",
      "  description: 'Probe',",
      '  markdown: { remarkPlugins: [plugin] },',
      '});',
      '',
    ].join('\n'),
  );

  await write(
    join(root, 'plugin.ts'),
    [
      'export default function plugin() {',
      '  return (tree, file) => {',
      "    if (!String(file.path).includes('injected.mdx')) {",
      '      return;',
      '    }',
      '    for (const node of tree.children) {',
      "      if (node.type === 'yaml') {",
      "        node.value += '\\ninjected: from-plugin';",
      '      }',
      '    }',
      '  };',
      '}',
      '',
    ].join('\n'),
  );

  await write(
    join(root, 'content/plain.mdx'),
    [
      '---',
      'title: 示例标题',
      'my-key: 特殊字段',
      'author:',
      '  name: 作者',
      '---',
      '',
      "{'PLAIN=' + frontmatter.title}",
      '',
      "{'HYPHEN=' + frontmatter['my-key']}",
      '',
      "{'NESTED=' + frontmatter.author.name}",
      '',
    ].join('\n'),
  );

  const emptyBody = "{'EMPTY=' + JSON.stringify(frontmatter)}\n";

  await write(join(root, 'content/empty.mdx'), `---\n---\n\n${emptyBody}`);

  await write(
    join(root, 'content/comment.mdx'),
    `---\n# comment\n---\n\n${emptyBody}`,
  );
  await write(join(root, 'content/none.mdx'), emptyBody);

  await write(
    join(root, 'content/injected.mdx'),
    [
      '---',
      'title: 注入',
      '---',
      '',
      "{'INJECTED=' + frontmatter.injected}",
      '',
    ].join('\n'),
  );

  await write(
    join(root, 'content/react-dom.mdx'),
    [
      "import { useState } from 'react';",
      "import { prerender } from 'react-dom/static';",
      '',
      'export function Preview() {',
      "  const [html, setHtml] = useState('');",
      '',
      '  return (',
      '    <>',
      '      <button',
      '        onClick={async () => {',
      '          const { prelude } = await prerender(<strong>PREVIEW_OK</strong>);',
      '          setHtml(await new Response(prelude).text());',
      '        }}',
      '      >',
      '        Preview',
      '      </button>',
      '      <pre>{html}</pre>',
      '    </>',
      '  );',
      '}',
      '',
      '<Preview />',
      '',
    ].join('\n'),
  );

  await write(
    join(root, 'content/md.md'),
    ['---', 'title: 普通标题', '---', '', 'MD_PAGE_BODY', ''].join('\n'),
  );

  await write(
    join(root, 'content/fragment-host.mdx'),
    [
      '---',
      'title: 宿主标题',
      '---',
      '',
      "import Note from './.fragments/note.mdx';",
      '',
      '<Note />',
      '',
    ].join('\n'),
  );

  await write(
    join(root, 'content/.fragments/note.mdx'),
    [
      '---',
      'title: 片段标题',
      '---',
      '',
      "import { useFrontmatter } from 'phyllo';",
      '',
      "{'FRAGMENT=' + frontmatter.title}",
      '',
      "{'HOST=' + useFrontmatter().title}",
      '',
    ].join('\n'),
  );

  await symlink(
    join(import.meta.dir, '../docs/node_modules'),
    join(root, 'node_modules'),
  );

  const build = await createBuild(root);

  expectIncludes('普通字段页面', pageHtml(build, '/plain'), [
    'PLAIN=示例标题',
    'HYPHEN=特殊字段',
    'NESTED=作者',
  ]);

  for (const url of ['/empty', '/comment', '/none']) {
    expectIncludes(`${url} 页面`, pageHtml(build, url), ['EMPTY={}']);
  }

  expectIncludes('注入字段页面', pageHtml(build, '/injected'), [
    'INJECTED=from-plugin',
  ]);

  expectIncludes('Markdown 页面', pageHtml(build, '/md'), [
    'MD_PAGE_BODY',
    '普通标题',
  ]);

  // 生产构建覆盖带目标条件入口的 react-dom 子路径。
  expectIncludes('运行时子路径页面', pageHtml(build, '/react-dom'), [
    'Preview',
  ]);

  expectIncludes('片段页面', pageHtml(build, '/fragment-host'), [
    'FRAGMENT=片段标题',
    'HOST=宿主标题',
  ]);

  // 用户 remark 插件修改后，页面数据与导出一致。
  const project = await loadProject(root);
  const index = await indexContent(project, createCompiler(project));
  const injected = index.pages.find(page => page.url === '/injected');

  if (injected?.frontmatter.injected !== 'from-plugin') {
    throw new Error('页面数据没有反映用户 remark 插件的修改');
  }

  // .md 不导出 frontmatter，.mdx 导出。
  const compile = createCompiler(project);
  const md = await compile(join(project.content, 'md.md'));
  const mdx = await compile(join(project.content, 'plain.mdx'));

  if (md.code.includes('export const frontmatter')) {
    throw new Error('.md 不应导出 frontmatter');
  }

  if (!mdx.code.includes('export const frontmatter')) {
    throw new Error('.mdx 应导出 frontmatter');
  }

  // 生成 MDX 通配声明。
  expectIncludes(
    'mdx.d.ts',
    await readFile(join(root, '.phyllo/mdx.d.ts'), 'utf8'),
    [
      "declare module '*.mdx' {",
      "import type { Frontmatter } from 'phyllo/types';",
      'export const frontmatter: Frontmatter;',
    ],
  );

  // 错误场景：非对象 frontmatter 与导出名冲突。
  await write(join(root, 'content/bad.mdx'), '---\n- a\n- b\n---\n\n# Bad\n');
  await expectBuildError('非对象 frontmatter', 'Frontmatter must be an object');
  await rm(join(root, 'content/bad.mdx'));

  await write(
    join(root, 'content/conflict.mdx'),
    [
      '---',
      'title: 冲突',
      '---',
      '',
      "export const frontmatter = { title: 'x' };",
      '',
      '# Conflict',
      '',
    ].join('\n'),
  );
  await expectBuildError('导出名冲突', 'frontmatter');
  await rm(join(root, 'content/conflict.mdx'));

  console.log(
    'frontmatter 验证通过：字段读取、空值归一化、片段与宿主区分、用户插件一致性、错误处理与类型声明',
  );
} finally {
  await rm(root, { recursive: true, force: true });
}
