import { build, file } from 'bun';
import {
  mkdir,
  mkdtemp,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { build as buildSite, createBuild } from '../packages/core/src/build';
import { contentPlugin } from '../packages/core/src/build/plugin';
import {
  resolveContentDirectories,
  scanContent,
} from '../packages/core/src/content';
import { createCompiler } from '../packages/core/src/content/compile';

import { verifyProject } from './verify-project';

/**
 * 验证符号链接内容目录：
 *
 * - 唯一链接路径下，页面、相对链接与嵌套内容全部按 `content/` 下的逻辑路径生成；
 *   模块解析保持打包器原生行为，包括扩展名省略、目录入口、`.js` 到 TypeScript
 *   的替换、浏览器字段映射与包作用域。
 * - 同一真实内容出现多个链接路径时无法确定唯一逻辑地址，构建直接报错。
 *
 * 需要真实文件读写与打包器协作，按项目规范放在独立脚本中执行。
 */
const root = await mkdtemp(join(tmpdir(), 'phyllo-symlinks-'));
const content = join(root, 'content');
const source = join(root, 'shared/source');

/**
 * 写出被链接的文章组与包配置。
 *
 * @param directory - 文章组的真实目录。
 */
async function writeArticles(directory: string) {
  await writeFile(
    join(directory, 'package.json'),
    JSON.stringify({
      name: 'shared-source',
      type: 'module',
      imports: { '#settings': './settings.ts' },
      browser: { './runtime.js': './runtime.browser.js' },
    }),
  );

  await writeFile(
    join(directory, 'article.mdx'),
    [
      "import runtime from './runtime.js';",
      "import Note from './note.mdx';",
      "import Panel from './Panel';",
      "import PanelJs from './PanelJs.js';",
      "import Panels from './panels';",
      "import Hidden from './.fragments/hidden.mdx';",
      '',
      '{runtime}',
      '',
      '[Own](./own.md)',
      '',
      '<Note />',
      '<Panel />',
      '<PanelJs />',
      '<Panels />',
      '<Hidden />',
      '',
    ].join('\n'),
  );

  await writeFile(
    join(directory, 'PanelJs.tsx'),
    [
      "import Note from './note.mdx';",
      '',
      'export default function PanelJs() {',
      '  return (',
      '    <>',
      '      PANEL_JS_ENTRY',
      '      <Note />',
      '    </>',
      '  );',
      '}',
      '',
    ].join('\n'),
  );

  await writeFile(
    join(directory, 'Panel.tsx'),
    [
      "import Note from './note.mdx';",
      '',
      'export default function Panel() {',
      '  return <Note />;',
      '}',
      '',
    ].join('\n'),
  );

  await mkdir(join(directory, 'panels'), { recursive: true });

  await writeFile(
    join(directory, 'panels/index.tsx'),
    [
      "import Deep from './deep.mdx';",
      '',
      'export default function Panels() {',
      '  return <Deep />;',
      '}',
      '',
    ].join('\n'),
  );

  await writeFile(join(directory, 'note.mdx'), '[Nested](./nested.md)\n');

  await writeFile(
    join(directory, 'panels/deep.mdx'),
    '[Deep](./deep-target.md)\n',
  );
  await writeFile(join(directory, 'own.md'), '# own\n');
  await writeFile(join(directory, 'nested.md'), '# nested\n');
  await writeFile(join(directory, 'panels/deep-target.md'), '# deep\n');
  await writeFile(join(directory, 'hidden-target.md'), '# hidden target\n');
  await writeFile(join(directory, 'pic.svg'), '<svg></svg>');
  await mkdir(join(directory, '.fragments'), { recursive: true });

  await writeFile(
    join(directory, '.fragments/hidden.mdx'),
    [
      'HIDDEN_ENTRY',
      '',
      '[Hidden](../hidden-target.md)',
      '',
      '![Pic](../pic.svg)',
      '',
    ].join('\n'),
  );

  await writeFile(
    join(directory, 'runtime.js'),
    "export default 'RUNTIME_ENTRY';\n",
  );

  await writeFile(
    join(directory, 'runtime.browser.js'),
    "export default 'BROWSER_ENTRY';\n",
  );

  await writeFile(
    join(directory, 'settings.ts'),
    "export default 'SCOPE-OK';\n",
  );

  await writeFile(
    join(directory, 'scope.mdx'),
    ["import settings from '#settings';", '', '{settings}', ''].join('\n'),
  );
}

/**
 * 按给定页面单独打包并返回产物代码。
 *
 * @param page - 页面逻辑路径。
 * @param target - 打包目标。
 * @returns 产物代码。
 * @throws 打包失败时抛出错误。
 */
async function bundle(page: string, target: 'bun' | 'browser') {
  const project = verifyProject(root);
  const directories = await resolveContentDirectories(project);
  const entry = `${page}.entry.ts`;

  await writeFile(entry, `export { default } from ${JSON.stringify(page)};\n`);

  const result = await build({
    entrypoints: [entry],
    target,
    plugins: [
      contentPlugin({
        project,
        compile: createCompiler(project),
        files: new Map(),
        directories,
      }),
    ],
  });

  if (!result.success) {
    throw new AggregateError(
      result.logs,
      `${page} 在 ${target} 目标打包失败。`,
    );
  }
  const [output] = result.outputs;

  if (!output) {
    throw new Error(`${page} 在 ${target} 目标没有产物。`);
  }
  return output.text();
}

/**
 * 不经 Phyllo 插件打包相同来源的相对导入，作为浏览器字段映射的原生对照。
 *
 * @param target - 打包目标。
 * @returns 产物代码。
 * @throws 打包失败时抛出错误。
 */
async function nativeBundle(target: 'bun' | 'browser') {
  const entry = join(source, 'control.ts');

  await writeFile(entry, "export { default } from './runtime.js';\n");

  const result = await build({ entrypoints: [entry], target });

  if (!result.success) {
    throw new AggregateError(result.logs, `原生 ${target} 目标打包失败。`);
  }
  const [output] = result.outputs;

  if (!output) {
    throw new Error(`原生 ${target} 目标没有产物。`);
  }
  return output.text();
}

/**
 * 断言产物包含全部片段。
 *
 * @param name - 断言对象名称。
 * @param code - 产物代码。
 * @param values - 必须出现的片段。
 */
function expectIncludes(name: string, code: string, values: readonly string[]) {
  for (const value of values) {
    if (!code.includes(value)) {
      throw new Error(`${name}缺少：${value}`);
    }
  }
}

/**
 * 断言产物只包含浏览器字段映射后的一项。
 *
 * @param name - 断言对象名称。
 * @param code - 产物代码。
 * @param expected - 应出现的标记。
 * @param other - 不应出现的标记。
 */
function expectChoice(
  name: string,
  code: string,
  expected: string,
  other: string,
) {
  if (!code.includes(expected) || code.includes(other)) {
    throw new Error(`${name}未按原生解析选择 ${expected}`);
  }
}

/**
 * 断言同一真实内容的多个链接路径被拒绝。
 *
 * @param directory - 站点根目录。
 * @param paths - 错误信息中必须出现的相对路径。
 * @throws 未报错或错误信息缺少路径时抛出错误。
 */
async function expectDuplicateError(
  directory: string,
  paths: readonly string[],
) {
  const project = verifyProject(directory);

  try {
    await resolveContentDirectories(project);
  } catch (error) {
    const message = String(error);

    for (const path of paths) {
      if (!message.includes(path)) {
        throw new Error(`重复链接错误缺少路径：${path}`, { cause: error });
      }
    }
    return;
  }
  throw new Error(`同一真实内容的多个链接路径未报错：${paths.join('、')}`);
}

/**
 * 汇总错误与打包日志信息。
 *
 * @param error - 原始错误。
 * @returns 用于断言的信息文本。
 */
function summarizeError(error: unknown) {
  const parts = [String(error)];
  const aggregate = error as { errors?: unknown[]; logs?: unknown[] };

  for (const item of [...(aggregate.errors ?? []), ...(aggregate.logs ?? [])]) {
    parts.push((item as { message?: string }).message ?? String(item));
  }
  return parts.join('\n');
}

try {
  await mkdir(source, { recursive: true });
  await mkdir(content, { recursive: true });
  await writeArticles(source);
  await symlink(source, join(content, 'published'));
  await symlink(join(source, 'own.md'), join(content, 'alias.md'));

  const scanned = await scanContent(content);

  if (scanned.includes('alias.md')) {
    throw new Error('文件符号链接不应收录。');
  }

  if (!scanned.includes('published/article.mdx')) {
    throw new Error('目录符号链接应被跟随。');
  }

  const page = join(content, 'published/article.mdx');
  const bun = await bundle(page, 'bun');
  const browser = await bundle(page, 'browser');
  const links = [
    '/published/own',
    '/published/nested',
    '/published/panels/deep-target',
    '/published/hidden-target',
  ];

  // 页面地址与嵌套链接都位于别名逻辑目录：直接 MDX、省略扩展名的组件、
  // 目录入口组件与子目录嵌套全部覆盖。
  expectIncludes('别名页面（bun）', bun, links);
  expectIncludes('别名页面（browser）', browser, links);

  // `.js` 说明符替换到 TypeScript 源码。
  expectIncludes('别名页面（bun）', bun, ['PANEL_JS_ENTRY']);
  expectIncludes('别名页面（browser）', browser, ['PANEL_JS_ENTRY']);

  // 未参与页面扫描的片段目录按逻辑路径编译，链接与相对图片都保持在内容目录内。
  expectIncludes('别名页面（bun）', bun, ['HIDDEN_ENTRY', '/_phyllo/media/']);

  expectIncludes('别名页面（browser）', browser, [
    'HIDDEN_ENTRY',
    '/_phyllo/media/',
  ]);

  // 浏览器字段映射与原生 Bun 行为一致。
  expectChoice('别名页面（bun）', bun, 'RUNTIME_ENTRY', 'BROWSER_ENTRY');

  expectChoice(
    '别名页面（browser）',
    browser,
    'BROWSER_ENTRY',
    'RUNTIME_ENTRY',
  );

  const nativeBun = await nativeBundle('bun');
  const nativeBrowser = await nativeBundle('browser');

  expectChoice('原生对照（bun）', nativeBun, 'RUNTIME_ENTRY', 'BROWSER_ENTRY');

  expectChoice(
    '原生对照（browser）',
    nativeBrowser,
    'BROWSER_ENTRY',
    'RUNTIME_ENTRY',
  );

  // 包作用域按真实位置解析。
  expectIncludes(
    '包作用域页面',
    await bundle(join(content, 'published/scope.mdx'), 'bun'),
    ['SCOPE-OK'],
  );

  // 普通目录中的隐藏片段与链接目录中的片段行为一致。
  await mkdir(join(content, 'plain/.fragments'), { recursive: true });

  await writeFile(
    join(content, 'plain/article.mdx'),
    [
      "import Note from './.fragments/note.mdx';",
      '',
      'PLAIN_ENTRY',
      '',
      '<Note />',
      '',
    ].join('\n'),
  );

  await writeFile(
    join(content, 'plain/.fragments/note.mdx'),
    '[Target](../target.md)\n',
  );
  await writeFile(join(content, 'plain/target.md'), '# target\n');

  expectIncludes(
    '普通目录隐藏片段',
    await bundle(join(content, 'plain/article.mdx'), 'bun'),
    ['PLAIN_ENTRY', '/plain/target'],
  );

  // 同一真实内容出现多个链接路径时直接报错。
  const internalRoot = join(root, 'reject-internal');

  await mkdir(join(internalRoot, 'content/original'), { recursive: true });
  await writeFile(join(internalRoot, 'content/original/a.mdx'), '# a\n');

  await symlink(
    join(internalRoot, 'content/original'),
    join(internalRoot, 'content/linked'),
  );
  await expectDuplicateError(internalRoot, ['linked', 'original']);

  const doubleRoot = join(root, 'reject-double');

  await mkdir(join(doubleRoot, 'external'), { recursive: true });
  await mkdir(join(doubleRoot, 'content'), { recursive: true });
  await writeFile(join(doubleRoot, 'external/b.mdx'), '# b\n');

  await symlink(
    join(doubleRoot, 'external'),
    join(doubleRoot, 'content/alpha'),
  );
  await symlink(join(doubleRoot, 'external'), join(doubleRoot, 'content/beta'));
  await expectDuplicateError(doubleRoot, ['alpha', 'beta']);

  // 内容根目录链接切换后，复用构建与全新构建的路由、链接与资源一致。
  const reuseRoot = join(root, 'reuse-site');
  const firstContent = join(reuseRoot, 'first');
  const secondContent = join(reuseRoot, 'second');

  await mkdir(firstContent, { recursive: true });
  await mkdir(secondContent, { recursive: true });

  await writeFile(
    join(reuseRoot, 'phyllo.config.ts'),
    [
      "import { defineConfig } from '@phyllo/core';",
      '',
      'export default defineConfig({',
      "  theme: 'phyllo-theme-docs',",
      "  title: 'Reuse',",
      '});',
      '',
    ].join('\n'),
  );

  await writeFile(
    join(firstContent, 'page.mdx'),
    '# First\n\nFIRST_BODY\n\n[Second](./second-page.md)\n\n![Pic](./pic.svg)\n',
  );
  await writeFile(join(firstContent, 'second-page.md'), '# Second\n');
  await writeFile(join(firstContent, 'pic.svg'), '<svg></svg>');

  await writeFile(
    join(secondContent, 'page.mdx'),
    '# Second\n\nSECOND_BODY\n\n[First](./first-page.md)\n\n![Pic](./pic.svg)\n',
  );
  await writeFile(join(secondContent, 'first-page.md'), '# First\n');
  await writeFile(join(secondContent, 'pic.svg'), '<svg></svg>');
  await symlink(firstContent, join(reuseRoot, 'content'));

  await symlink(
    join(import.meta.dir, '../docs/node_modules'),
    join(reuseRoot, 'node_modules'),
  );

  const previous = await createBuild(reuseRoot, { development: true });

  await rm(join(reuseRoot, 'content'), { force: true });
  await symlink(secondContent, join(reuseRoot, 'content'));

  const reused = await createBuild(reuseRoot, {
    development: true,
    previous,
  });
  const fresh = await createBuild(reuseRoot, { development: true });
  const resources = { styles: [], scripts: [], head: [] };
  const reusedHtml = await reused.render('/page', resources);
  const freshHtml = await fresh.render('/page', resources);

  if (
    [...reused.routes.keys()].sort().join('|') !==
    [...fresh.routes.keys()].sort().join('|')
  ) {
    throw new Error('内容根目录切换后复用构建与全新构建的路由不一致。');
  }

  for (const [name, html] of [
    ['复用构建', reusedHtml],
    ['全新构建', freshHtml],
  ] as const) {
    if (
      !html.includes('SECOND_BODY') ||
      !html.includes('href="/first-page"') ||
      html.includes('FIRST_BODY')
    ) {
      throw new Error(`${name}未按新的内容根目录生成页面与链接。`);
    }
  }

  const assetPattern = /\/_phyllo\/media\/[a-z0-9]+\.svg/;
  const reusedAsset = assetPattern.exec(reusedHtml)?.[0];
  const freshAsset = assetPattern.exec(freshHtml)?.[0];

  if (reusedAsset === undefined || reusedAsset !== freshAsset) {
    throw new Error('内容根目录切换后复用构建与全新构建的资源地址不一致。');
  }

  // 链接目录根目录没有文章：祖先映射仍覆盖隐藏片段，链接按逻辑路径生成。
  const siblingRoot = join(root, 'sibling-site');

  await mkdir(join(siblingRoot, 'shared/posts'), { recursive: true });
  await mkdir(join(siblingRoot, 'shared/.fragments'), { recursive: true });
  await mkdir(join(siblingRoot, 'content'), { recursive: true });

  await writeFile(
    join(siblingRoot, 'phyllo.config.ts'),
    [
      "import { defineConfig } from '@phyllo/core';",
      '',
      'export default defineConfig({',
      "  theme: 'phyllo-theme-docs',",
      "  title: 'Sibling',",
      '});',
      '',
    ].join('\n'),
  );

  await writeFile(
    join(siblingRoot, 'shared/posts/article.mdx'),
    "import Note from '../.fragments/note.mdx';\n\n<Note />\n",
  );
  await writeFile(join(siblingRoot, 'shared/posts/target.md'), '# Target\n');

  await writeFile(
    join(siblingRoot, 'shared/.fragments/note.mdx'),
    '[Target](../posts/target.md)\n',
  );

  await symlink(
    join(siblingRoot, 'shared'),
    join(siblingRoot, 'content/published'),
  );

  await symlink(
    join(import.meta.dir, '../docs/node_modules'),
    join(siblingRoot, 'node_modules'),
  );

  const sibling = await createBuild(siblingRoot, { development: true });
  const siblingHtml = await sibling.render('/published/posts/article', {
    styles: [],
    scripts: [],
    head: [],
  });

  if (!siblingHtml.includes('href="/published/posts/target"')) {
    throw new Error('链接根目录没有文章时，隐藏片段未按逻辑路径还原链接。');
  }

  // 普通链接目录仍可通过完整构建生成产物。
  const siblingBuild = await buildSite(siblingRoot);

  if (
    siblingBuild.pages < 1 ||
    !(await file(
      join(siblingRoot, 'dist/published/posts/article.html'),
    ).exists())
  ) {
    throw new Error('普通链接目录未生成构建产物。');
  }

  // 输出目录包含经链接收录的内容来源：构建失败，源文件与已有产物保留。
  const conflictRoot = join(root, 'outdir-site');

  await mkdir(join(conflictRoot, 'content'), { recursive: true });
  await mkdir(join(conflictRoot, 'dist/source'), { recursive: true });

  await writeFile(
    join(conflictRoot, 'phyllo.config.ts'),
    [
      "import { defineConfig } from '@phyllo/core';",
      '',
      'export default defineConfig({',
      "  theme: 'phyllo-theme-docs',",
      "  title: 'Conflict',",
      '});',
      '',
    ].join('\n'),
  );
  await writeFile(join(conflictRoot, 'dist/source/article.md'), '# Article\n');
  await writeFile(join(conflictRoot, 'dist/existing.txt'), 'existing\n');

  await symlink(
    join(conflictRoot, 'dist/source'),
    join(conflictRoot, 'content/published'),
  );

  await symlink(
    join(import.meta.dir, '../docs/node_modules'),
    join(conflictRoot, 'node_modules'),
  );

  let overlapError = false;

  try {
    await buildSite(conflictRoot);
  } catch (error) {
    overlapError = String(error).includes(
      'outdir must not overlap content sources.',
    );
  }

  if (!overlapError) {
    throw new Error('输出目录包含链接内容来源时未报错。');
  }

  for (const path of ['dist/source/article.md', 'dist/existing.txt']) {
    if (!(await file(join(conflictRoot, path)).exists())) {
      throw new Error(`冲突报错后文件被删除：${path}`);
    }
  }

  // 未参与页面扫描的输入同样受保护：隐藏片段、Markdown 图片与 JS 导入图片。
  const inputCases = [
    {
      key: 'fragment',
      label: '隐藏片段',
      prepare: async (site: string) => {
        await symlink(
          join(site, 'dist/source'),
          join(site, 'content/.fragments'),
        );

        await writeFile(
          join(site, 'content/page.mdx'),
          "import Note from './.fragments/note.mdx';\n\n<Note />\n",
        );
        await writeFile(join(site, 'dist/source/note.mdx'), 'NOTE_BODY\n');

        return 'dist/source/note.mdx';
      },
    },
    {
      key: 'markdown-image',
      label: 'Markdown 图片',
      prepare: async (site: string) => {
        await symlink(join(site, 'dist/source'), join(site, 'content/media'));

        await writeFile(
          join(site, 'content/page.mdx'),
          '# Page\n\n![Pic](./media/pic.svg)\n',
        );
        await writeFile(join(site, 'dist/source/pic.svg'), '<svg></svg>\n');

        return 'dist/source/pic.svg';
      },
    },
    {
      key: 'import-image',
      label: 'JS 导入图片',
      prepare: async (site: string) => {
        await mkdir(join(site, 'components'), { recursive: true });

        await writeFile(
          join(site, 'components/icon.tsx'),
          "import icon from '../dist/source/js.svg';\n\nexport default function Icon() {\n  return <img src={icon} />;\n}\n",
        );

        await writeFile(
          join(site, 'content/page.mdx'),
          "import Icon from '../components/icon';\n\n<Icon />\n",
        );
        await writeFile(join(site, 'dist/source/js.svg'), '<svg></svg>\n');

        return 'dist/source/js.svg';
      },
    },
    // Bun 原生加载的输入：脚本、CSS、JSON、嵌套导入与符号链接目标。
    {
      key: 'bundle-script',
      label: '脚本导入',
      prepare: async (site: string) => {
        await writeFile(
          join(site, 'dist/source/Panel.tsx'),
          'export default function Panel() {\n  return <div data-panel />;\n}\n',
        );

        await writeFile(
          join(site, 'content/page.mdx'),
          "import Panel from '../dist/source/Panel.tsx';\n\n<Panel />\n",
        );

        return 'dist/source/Panel.tsx';
      },
    },
    {
      key: 'bundle-css',
      label: 'CSS 导入',
      prepare: async (site: string) => {
        await writeFile(
          join(site, 'dist/source/style.css'),
          '/* bundle css */\n',
        );

        await writeFile(
          join(site, 'content/page.mdx'),
          "import '../dist/source/style.css';\n\n# Page\n",
        );

        return 'dist/source/style.css';
      },
    },
    {
      key: 'bundle-json',
      label: 'JSON 导入',
      prepare: async (site: string) => {
        await writeFile(
          join(site, 'dist/source/value.json'),
          JSON.stringify({ label: 'JSON_VALUE' }),
        );

        await writeFile(
          join(site, 'content/page.mdx'),
          "import value from '../dist/source/value.json';\n\n{value.label}\n",
        );

        return 'dist/source/value.json';
      },
    },
    {
      key: 'bundle-nested',
      label: '嵌套脚本导入',
      prepare: async (site: string) => {
        await mkdir(join(site, 'components'), { recursive: true });

        await writeFile(
          join(site, 'dist/source/helper.ts'),
          "export const helper = 'HELPER';\n",
        );

        // 组件在输出目录外，仅通过嵌套导入读取输出目录内的模块。
        await writeFile(
          join(site, 'components/Panel.tsx'),
          "import { helper } from '../dist/source/helper.ts';\n\nexport default function Panel() {\n  return <div data-panel>{helper}</div>;\n}\n",
        );

        await writeFile(
          join(site, 'content/page.mdx'),
          "import Panel from '../components/Panel';\n\n<Panel />\n",
        );

        return 'dist/source/helper.ts';
      },
    },
    {
      key: 'bundle-symlink',
      label: '符号链接脚本',
      prepare: async (site: string) => {
        await writeFile(
          join(site, 'dist/source/Panel.tsx'),
          'export default function Panel() {\n  return <div data-panel />;\n}\n',
        );

        await symlink(
          join(site, 'dist/source/Panel.tsx'),
          join(site, 'linked-panel.tsx'),
        );

        await writeFile(
          join(site, 'content/page.mdx'),
          "import Panel from '../linked-panel.tsx';\n\n<Panel />\n",
        );

        return 'dist/source/Panel.tsx';
      },
    },
    {
      key: 'bundle-config',
      label: '配置导入 JSON',
      prepare: async (site: string) => {
        await writeFile(
          join(site, 'dist/source/config.json'),
          JSON.stringify({ title: 'Config' }),
        );

        await writeFile(
          join(site, 'phyllo.config.ts'),
          [
            "import { defineConfig } from '@phyllo/core';",
            "import options from './dist/source/config.json';",
            '',
            'export default defineConfig({',
            "  theme: 'phyllo-theme-docs',",
            '  title: options.title,',
            '});',
            '',
          ].join('\n'),
        );

        return 'dist/source/config.json';
      },
    },
    {
      key: 'bundle-config-cwd',
      label: '配置改变工作目录后导入 JSON',
      prepare: async (site: string) => {
        await writeFile(
          join(site, 'dist/source/config.json'),
          JSON.stringify({ title: 'Config' }),
        );

        await writeFile(
          join(site, 'phyllo.config.ts'),
          [
            "import { defineConfig } from '@phyllo/core';",
            "import options from './dist/source/config.json';",
            '',
            `process.chdir(${JSON.stringify(site)});`,
            '',
            'export default defineConfig({',
            "  theme: 'phyllo-theme-docs',",
            '  title: options.title,',
            '});',
            '',
          ].join('\n'),
        );

        return 'dist/source/config.json';
      },
    },
  ];

  const startCwd = process.cwd();

  for (const { key, label, prepare } of inputCases) {
    const site = join(root, `input-${key}`);

    await mkdir(join(site, 'content'), { recursive: true });
    await mkdir(join(site, 'dist/source'), { recursive: true });

    await writeFile(
      join(site, 'phyllo.config.ts'),
      [
        "import { defineConfig } from '@phyllo/core';",
        '',
        'export default defineConfig({',
        "  theme: 'phyllo-theme-docs',",
        "  title: 'Input',",
        '});',
        '',
      ].join('\n'),
    );
    await writeFile(join(site, 'dist/keep.txt'), 'keep\n');

    await symlink(
      join(import.meta.dir, '../docs/node_modules'),
      join(site, 'node_modules'),
    );

    const preserved = await prepare(site);

    let failure = '';

    try {
      await buildSite(site);
    } catch (error) {
      failure = summarizeError(error);
    }

    if (
      !failure.includes('must not be inside the output directory') &&
      !failure.includes('must not overlap content sources')
    ) {
      throw new Error(
        `${label}位于输出目录内时未报错：${failure.slice(0, 200)}`,
      );
    }

    for (const path of [preserved, 'dist/keep.txt']) {
      if (!(await file(join(site, path)).exists())) {
        throw new Error(`${label}冲突报错后文件被删除：${path}`);
      }
    }
    process.chdir(startCwd);
  }

  // 隐藏目录符号链接：片段、相对文章链接与图片按逻辑路径解析。
  const hiddenRoot = join(root, 'hidden-link-site');

  await mkdir(join(hiddenRoot, 'content'), { recursive: true });
  await mkdir(join(hiddenRoot, 'shared/fragments'), { recursive: true });

  await writeFile(
    join(hiddenRoot, 'phyllo.config.ts'),
    [
      "import { defineConfig } from '@phyllo/core';",
      '',
      'export default defineConfig({',
      "  theme: 'phyllo-theme-docs',",
      "  title: 'Hidden',",
      '});',
      '',
    ].join('\n'),
  );

  await writeFile(
    join(hiddenRoot, 'content/page.mdx'),
    "import Note from './.fragments/note.mdx';\n\n<Note />\n",
  );
  await writeFile(join(hiddenRoot, 'content/other.mdx'), '# Other\n');

  await writeFile(
    join(hiddenRoot, 'shared/fragments/note.mdx'),
    '[Other](../other.mdx)\n\n![Pic](./pic.svg)\n',
  );

  await writeFile(
    join(hiddenRoot, 'shared/fragments/pic.svg'),
    '<svg></svg>\n',
  );

  await symlink(
    join(hiddenRoot, 'shared/fragments'),
    join(hiddenRoot, 'content/.fragments'),
  );

  await symlink(
    join(import.meta.dir, '../docs/node_modules'),
    join(hiddenRoot, 'node_modules'),
  );

  const hidden = await createBuild(hiddenRoot, { development: true });
  const hiddenHtml = await hidden.render('/page', {
    styles: [],
    scripts: [],
    head: [],
  });

  if (
    !hiddenHtml.includes('href="/other"') ||
    !/\/_phyllo\/media\/[a-z0-9]+\.svg/.test(hiddenHtml)
  ) {
    throw new Error('隐藏目录链接中的片段未按逻辑路径解析链接与图片。');
  }

  // 隐藏目录重复链接：同一真实目录的多个逻辑路径直接报错。
  const duplicateRoot = join(root, 'duplicate-hidden-site');

  await mkdir(join(duplicateRoot, 'content/a'), { recursive: true });
  await mkdir(join(duplicateRoot, 'content/b'), { recursive: true });
  await mkdir(join(duplicateRoot, 'shared/notes'), { recursive: true });

  await writeFile(
    join(duplicateRoot, 'phyllo.config.ts'),
    [
      "import { defineConfig } from '@phyllo/core';",
      '',
      'export default defineConfig({',
      "  theme: 'phyllo-theme-docs',",
      "  title: 'Duplicate',",
      '});',
      '',
    ].join('\n'),
  );

  await symlink(
    join(import.meta.dir, '../docs/node_modules'),
    join(duplicateRoot, 'node_modules'),
  );

  await writeFile(
    join(duplicateRoot, 'content/a/page.mdx'),
    "import Note from './.notes/note.mdx';\n\n<Note />\n",
  );

  await writeFile(
    join(duplicateRoot, 'content/b/page.mdx'),
    "import Note from './.notes/note.mdx';\n\n<Note />\n",
  );
  await writeFile(join(duplicateRoot, 'content/a/target.mdx'), '# A\n');
  await writeFile(join(duplicateRoot, 'content/b/target.mdx'), '# B\n');

  await writeFile(
    join(duplicateRoot, 'shared/notes/note.mdx'),
    '[Target](../target.mdx)\n',
  );

  await symlink(
    join(duplicateRoot, 'shared/notes'),
    join(duplicateRoot, 'content/a/.notes'),
  );

  await symlink(
    join(duplicateRoot, 'shared/notes'),
    join(duplicateRoot, 'content/b/.notes'),
  );

  let duplicateHidden = '';

  try {
    await createBuild(duplicateRoot, { development: true });
  } catch (error) {
    duplicateHidden = summarizeError(error);
  }

  if (
    !duplicateHidden.includes(
      'Content directory is reachable through multiple paths',
    ) ||
    !duplicateHidden.includes('a/.notes') ||
    !duplicateHidden.includes('b/.notes')
  ) {
    throw new Error(`隐藏目录重复链接未报错：${duplicateHidden.slice(0, 200)}`);
  }

  // 物理隐藏目录与其链接共存：同一真实目录的多个逻辑路径直接报错。
  const originalRoot = join(root, 'original-hidden-site');

  await mkdir(join(originalRoot, 'content/.original'), { recursive: true });
  await mkdir(join(originalRoot, 'content/a'), { recursive: true });

  await writeFile(
    join(originalRoot, 'phyllo.config.ts'),
    [
      "import { defineConfig } from '@phyllo/core';",
      '',
      'export default defineConfig({',
      "  theme: 'phyllo-theme-docs',",
      "  title: 'Original',",
      '});',
      '',
    ].join('\n'),
  );

  await symlink(
    join(import.meta.dir, '../docs/node_modules'),
    join(originalRoot, 'node_modules'),
  );

  await writeFile(
    join(originalRoot, 'content/page.mdx'),
    "import Note from './.original/note.mdx';\n\n<Note />\n",
  );
  await writeFile(join(originalRoot, 'content/target.mdx'), '# Target\n');

  await writeFile(
    join(originalRoot, 'content/.original/note.mdx'),
    '[Target](../target.mdx)\n',
  );

  await writeFile(
    join(originalRoot, 'content/a/page.mdx'),
    "import Note from './.notes/note.mdx';\n\n<Note />\n",
  );
  await writeFile(join(originalRoot, 'content/a/target.mdx'), '# A Target\n');

  await symlink(
    join(originalRoot, 'content/.original'),
    join(originalRoot, 'content/a/.notes'),
  );

  let originalHidden = '';

  try {
    await createBuild(originalRoot, { development: true });
  } catch (error) {
    originalHidden = summarizeError(error);
  }

  if (
    !originalHidden.includes(
      'Content directory is reachable through multiple paths',
    ) ||
    !originalHidden.includes('.original') ||
    !originalHidden.includes('a/.notes')
  ) {
    throw new Error(
      `物理隐藏目录与链接共存时未报错：${originalHidden.slice(0, 200)}`,
    );
  }

  // 未引用的断链文件链接不参与收录，正常页面仍能构建。
  const brokenRoot = join(root, 'broken-link-site');

  await mkdir(join(brokenRoot, 'content'), { recursive: true });

  await writeFile(
    join(brokenRoot, 'phyllo.config.ts'),
    [
      "import { defineConfig } from '@phyllo/core';",
      '',
      'export default defineConfig({',
      "  theme: 'phyllo-theme-docs',",
      "  title: 'Broken',",
      '});',
      '',
    ].join('\n'),
  );
  await writeFile(join(brokenRoot, 'content/page.mdx'), '# Page\n');
  await mkdir(join(brokenRoot, 'shared/source'), { recursive: true });

  await writeFile(
    join(brokenRoot, 'shared/source/page2.mdx'),
    '# Linked Page\n',
  );

  await symlink(
    join(brokenRoot, 'missing.mdx'),
    join(brokenRoot, 'content/alias.mdx'),
  );

  await symlink(
    join(brokenRoot, 'missing.mdx'),
    join(brokenRoot, 'shared/source/alias2.mdx'),
  );

  await symlink(
    join(brokenRoot, 'shared/source'),
    join(brokenRoot, 'content/linked'),
  );

  await symlink(
    join(import.meta.dir, '../docs/node_modules'),
    join(brokenRoot, 'node_modules'),
  );

  const broken = await createBuild(brokenRoot, { development: true });
  const brokenHtml = await broken.render('/page', {
    styles: [],
    scripts: [],
    head: [],
  });

  const linkedHtml = await broken.render('/linked/page2', {
    styles: [],
    scripts: [],
    head: [],
  });

  if (
    !brokenHtml.includes('Page') ||
    broken.routes.has('/alias') ||
    !linkedHtml.includes('Linked Page') ||
    broken.routes.has('/linked/alias2')
  ) {
    throw new Error('未引用的断链文件链接阻断了构建或进入了收录。');
  }

  // 产物文件与目录前缀冲突：清理前报错，已有产物保留。
  const prefixRoot = join(root, 'output-conflict-site');

  await mkdir(join(prefixRoot, 'content/foo.html'), { recursive: true });
  await mkdir(join(prefixRoot, 'dist'), { recursive: true });

  await writeFile(
    join(prefixRoot, 'phyllo.config.ts'),
    [
      "import { defineConfig } from '@phyllo/core';",
      '',
      'export default defineConfig({',
      "  theme: 'phyllo-theme-docs',",
      "  title: 'Prefix',",
      '});',
      '',
    ].join('\n'),
  );
  await writeFile(join(prefixRoot, 'content/foo.mdx'), '# Foo\n');
  await writeFile(join(prefixRoot, 'content/foo.html/bar.mdx'), '# Bar\n');
  await writeFile(join(prefixRoot, 'dist/keep.txt'), 'keep\n');

  await symlink(
    join(import.meta.dir, '../docs/node_modules'),
    join(prefixRoot, 'node_modules'),
  );

  let prefixError = '';

  try {
    await buildSite(prefixRoot);
  } catch (error) {
    prefixError = summarizeError(error);
  }

  if (
    !prefixError.includes('Output paths conflict') ||
    !prefixError.includes('foo.html and foo.html/bar.html')
  ) {
    throw new Error(`产物路径冲突未报错：${prefixError.slice(0, 200)}`);
  }

  if (!(await file(join(prefixRoot, 'dist/keep.txt')).exists())) {
    throw new Error('产物路径冲突报错后已有产物被删除。');
  }

  // 文件系统级产物冲突：按实际规则在清理前报错，区分大小写时正常生成。
  const caseRoot = join(root, 'case-conflict-site');
  const probeFile = join(caseRoot, 'case-probe.txt');

  await mkdir(join(caseRoot, 'content'), { recursive: true });
  await mkdir(join(caseRoot, 'dist'), { recursive: true });

  await writeFile(
    join(caseRoot, 'phyllo.config.ts'),
    [
      "import { defineConfig } from '@phyllo/core';",
      '',
      'export default defineConfig({',
      "  theme: 'phyllo-theme-docs',",
      "  title: 'Case',",
      "  redirects: { '/A': '/a' },",
      '});',
      '',
    ].join('\n'),
  );
  await writeFile(join(caseRoot, 'content/a.mdx'), '# A\n');
  await writeFile(join(caseRoot, 'dist/keep.txt'), 'keep\n');
  await mkdir(join(caseRoot, 'dist/.phyllo-output-check'), { recursive: true });

  await writeFile(
    join(caseRoot, 'dist/.phyllo-output-check/keep.txt'),
    'probe keep\n',
  );

  await symlink(
    join(import.meta.dir, '../docs/node_modules'),
    join(caseRoot, 'node_modules'),
  );

  // 探测当前文件系统是否区分大小写。
  await writeFile(probeFile, '');

  const caseInsensitive = await file(join(caseRoot, 'CASE-PROBE.TXT')).exists();

  await rm(probeFile, { force: true });

  let caseError = '';

  try {
    await buildSite(caseRoot);
  } catch (error) {
    caseError = summarizeError(error);
  }

  if (caseInsensitive) {
    if (!caseError.includes('Output paths conflict on this filesystem')) {
      throw new Error(`大小写冲突未报错：${caseError.slice(0, 200)}`);
    }

    for (const name of [
      'dist/keep.txt',
      'dist/.phyllo-output-check/keep.txt',
    ]) {
      if (!(await file(join(caseRoot, name)).exists())) {
        throw new Error(`大小写冲突报错后已有产物被删除：${name}`);
      }
    }
    const leftover = (await readdir(join(caseRoot, 'dist'))).filter(name =>
      name.startsWith('.phyllo-output-check-'),
    );

    if (leftover.length > 0) {
      throw new Error(`校验失败后残留临时目录：${leftover.join('、')}`);
    }
  } else {
    if (caseError !== '') {
      throw new Error(
        `区分大小写的文件系统构建失败：${caseError.slice(0, 200)}`,
      );
    }

    for (const name of ['dist/a.html', 'dist/A.html']) {
      if (!(await file(join(caseRoot, name)).exists())) {
        throw new Error(`区分大小写的文件系统缺少产物：${name}`);
      }
    }
  }

  console.log(
    '符号链接内容构建通过：唯一链接按逻辑路径生成页面与链接且保持原生解析，重复链接直接报错，内容根目录链接切换后复用构建与全新构建一致，链接根目录无文章时祖先映射覆盖隐藏片段，输出目录与内容来源（含片段、图片、脚本、CSS、JSON、配置导入与改变工作目录的配置）重叠时构建失败且文件保留，隐藏目录链接中的片段按逻辑路径解析，隐藏目录重复链接直接报错，物理隐藏目录与其链接共存直接报错，目录链接内未引用的断链文件链接不阻断构建，产物文件与目录前缀冲突在清理前报错且已有产物保留，文件系统级大小写冲突按实际规则在清理前报错且校验目录不影响已有产物',
  );
} finally {
  await rm(root, { recursive: true, force: true });
}
