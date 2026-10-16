import { file } from 'bun';
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
import { dev } from '../packages/core/src/dev';

/**
 * 验证主题来源与解析环境：
 *
 * - 依赖目录内的主题按包名导入，由打包器按构建目标解析条件入口；
 * - 主题自己的嵌套依赖在开发与生产选择一致，不改为站点依赖；
 * - Layout 与正文按包名导入的主题组件共享同一个主题模块实例；
 * - 嵌套源码与 JS 导入的图片随重建更新；
 * - browser 字段映射与原生浏览器构建一致；
 * - 符号链接的本地主题保持原生加载，.mjs 与 .mts 入口语义不变；
 * - 站点外的已安装主题不被监听，站点外的本地主题保持原生监听；
 * - 站点内主题包与输出目录重叠时构建失败，主题资源与已有产物保留；
 * - 主题包内的示例站点输出不受保护规则影响。
 *
 * 需要真实文件读写与打包器协作，按项目规范放在独立脚本中执行。
 */
const root = await mkdtemp(join(tmpdir(), 'phyllo-theme-source-'));
const outer = await mkdtemp(join(tmpdir(), 'phyllo-theme-outer-'));
const nodeModules = join(root, 'node_modules');
const repo = join(import.meta.dir, '..');
const resources = { styles: [], scripts: [], head: [] };

type Build = Awaited<ReturnType<typeof createBuild>>;
type Server = Awaited<ReturnType<typeof dev>>;

/**
 * 读取开发入口源码。
 *
 * @returns app.ts 的源码。
 */
function readApp() {
  return readFile(join(root, '.phyllo/dev/app.ts'), 'utf8');
}

/**
 * 渲染页面 HTML。
 *
 * @param build - 站点构建结果。
 * @param url - 页面地址。
 * @returns 页面 HTML。
 */
function renderHtml(build: Build, url = '/page') {
  return build.render(url, resources);
}

/**
 * 读取开发页面引用的客户端入口代码。
 *
 * @param server - 开发服务实例。
 * @param signal - 两次请求共用的超时信号。
 * @returns 客户端入口代码。
 * @throws 页面或入口缺失、请求超时时抛出错误。
 */
async function clientBundle(server: Server, signal: AbortSignal) {
  const page = await (
    await fetch(new URL('/page', server.url), { signal })
  ).text();
  const match = /src="(\/_bun\/client\/[^"]+)"/.exec(page);

  if (match === null) {
    throw new Error('开发页面缺少客户端入口。');
  }
  return (await fetch(new URL(match[1]!, server.url), { signal })).text();
}

/**
 * 轮询等待页面包含标记。
 *
 * @param server - 开发服务实例。
 * @param marker - 页面中必须出现的标记。
 * @returns 包含标记的页面 HTML。
 * @throws 超时仍未包含时抛出错误。
 */
async function waitForPage(server: Server, marker: string) {
  const signal = AbortSignal.timeout(20_000);

  let last: string;

  for (;;) {
    try {
      const page = await (
        await fetch(new URL('/page', server.url), { signal })
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

/**
 * 轮询等待客户端产物包含标记。
 *
 * @param server - 开发服务实例。
 * @param marker - 产物中必须出现的标记。
 * @returns 包含标记的客户端入口代码。
 * @throws 超时仍未包含时抛出错误。
 */
async function waitForBundle(server: Server, marker: string) {
  const signal = AbortSignal.timeout(20_000);

  let last: string;

  for (;;) {
    try {
      const code = await clientBundle(server, signal);

      if (code.includes(marker)) {
        return code;
      }
      last = '缺少标记';
    } catch (error) {
      last = String(error);
    }

    if (signal.aborted) {
      throw new Error(`客户端产物未在时限内包含 ${marker}：${last}`);
    }
    await Bun.sleep(200);
  }
}

/**
 * 写出主题包。
 *
 * @param name - 包名。
 * @param entry - 包入口，相对包目录。
 * @param files - 包内文件路径到源码的映射。
 * @returns 主题包目录。
 */
async function writeTheme(
  name: string,
  entry: string,
  files: Record<string, string>,
) {
  const directory = join(nodeModules, name);

  for (const [path, source] of Object.entries(files)) {
    await mkdir(join(directory, dirname(path)), { recursive: true });
    await writeFile(join(directory, path), source);
  }
  await writeFile(
    join(directory, 'package.json'),
    JSON.stringify({ name, type: 'module', exports: `./${entry}` }),
  );

  return directory;
}

/**
 * 切换站点配置的主题。
 *
 * @param name - 主题包名。
 */
function useTheme(name: string) {
  return writeFile(
    join(root, 'phyllo.config.ts'),
    `import { defineConfig } from '@phyllo/core';\n\nexport default defineConfig({ theme: ${JSON.stringify(name)} });\n`,
  );
}

/**
 * 写出内容页面。
 *
 * @param source - 页面源码。
 */
function writePage(source: string) {
  return writeFile(join(root, 'content/page.mdx'), source);
}

/**
 * 生成带标记的 TSX 布局源码。
 *
 * @param marker - 布局标记。
 * @returns 布局源码。
 */
function tsxLayout(marker: string) {
  return `import type { ReactNode } from 'react';\n\nexport default function Layout({ children }: { children?: ReactNode }) {\n  return <div data-theme="${marker}">{children}</div>;\n}\n`;
}

/**
 * 生成带标记的无 JSX JavaScript 布局源码。
 *
 * @param marker - 布局标记。
 * @returns 布局源码。
 */
function jsLayout(marker: string) {
  return `import { createElement } from 'react';\n\nexport default function Layout({ children }) {\n  return createElement('main', { 'data-theme': '${marker}' }, children);\n}\n`;
}

/**
 * 生成带标记的无 JSX TypeScript 布局源码。
 *
 * @param marker - 布局标记。
 * @returns 布局源码。
 */
function tsLayout(marker: string) {
  return `import { createElement } from 'react';\nimport type { ReactNode } from 'react';\n\nexport default function Layout({ children }: { children?: ReactNode }) {\n  return createElement('main', { 'data-theme': '${marker}' }, children);\n}\n`;
}

/**
 * 生成只输出标记的布局源码，不依赖 React 解析。
 *
 * @param marker - 布局标记。
 * @returns 布局源码。
 */
function plainLayout(marker: string) {
  return `export default function Layout() {\n  return '${marker}';\n}\n`;
}

try {
  await mkdir(join(nodeModules, '@phyllo'), { recursive: true });
  await mkdir(join(root, 'content'), { recursive: true });
  await symlink(join(repo, 'packages/phyllo'), join(nodeModules, 'phyllo'));
  await symlink(join(repo, 'packages/core'), join(nodeModules, '@phyllo/core'));

  await symlink(
    join(repo, 'docs/node_modules/react'),
    join(nodeModules, 'react'),
  );

  await symlink(
    join(repo, 'docs/node_modules/react-dom'),
    join(nodeModules, 'react-dom'),
  );
  await writePage('# Page\n');

  // 依赖目录内的主题按原始路径导入，嵌套源码随重建更新。
  await useTheme('theme-src');

  await writeTheme('theme-src', 'src/index.tsx', {
    'src/index.tsx': `import Heading from './parts/heading.mjs';\nimport type { ReactNode } from 'react';\n\nexport default function Layout({ children }: { children?: ReactNode }) {\n  return (\n    <div data-theme="src-one">\n      <Heading />\n      {children}\n    </div>\n  );\n}\n`,
    'src/parts/heading.mjs':
      "export default function Heading() {\n  return 'HEADING_ONE';\n}\n",
  });

  const first = await createBuild(root, { development: true });
  const app = await readApp();

  if (!app.includes('from "theme-src"')) {
    throw new Error('生成入口应按包名导入主题，由打包器按构建目标解析入口。');
  }

  if (/(?:^|\/)theme-[a-f0-9]+\//.test(app)) {
    throw new Error('生成入口不应使用主题副本路径。');
  }

  if (
    !(await renderHtml(first)).includes('data-theme="src-one"') ||
    !(await renderHtml(first)).includes('HEADING_ONE')
  ) {
    throw new Error('依赖目录内的主题未按原始路径渲染。');
  }

  await Bun.sleep(10);

  await writeFile(
    join(nodeModules, 'theme-src/src/parts/heading.mjs'),
    "export default function Heading() {\n  return 'HEADING_TWO';\n}\n",
  );

  const nested = await createBuild(root, {
    development: true,
    previous: first,
  });

  if (!(await renderHtml(nested)).includes('HEADING_TWO')) {
    throw new Error('嵌套源码变化未在开发构建中生效。');
  }

  // 主题自己的嵌套依赖：开发与生产选择一致。
  await useTheme('theme-deps');

  await writeTheme('theme-deps', 'src/index.tsx', {
    'src/index.tsx': `import dep from 'theme-dep';\nimport type { ReactNode } from 'react';\n\nexport default function Layout({ children }: { children?: ReactNode }) {\n  return (\n    <div data-theme="deps" data-dep={dep}>\n      {children}\n    </div>\n  );\n}\n`,
    'node_modules/theme-dep/package.json': JSON.stringify({
      name: 'theme-dep',
      type: 'module',
      exports: './index.mjs',
    }),
    'node_modules/theme-dep/index.mjs': "export default 'THEME_DEP_ONE';\n",
  });

  await writeTheme('theme-dep', 'index.mjs', {
    'index.mjs': "export default 'SITE_DEP_TWO';\n",
  });

  const depsDev = await renderHtml(
    await createBuild(root, { development: true }),
  );
  const depsProd = await renderHtml(await createBuild(root));

  for (const [name, html] of [
    ['开发构建', depsDev],
    ['生产构建', depsProd],
  ] as const) {
    if (
      !html.includes('data-dep="THEME_DEP_ONE"') ||
      html.includes('SITE_DEP_TWO')
    ) {
      throw new Error(`${name}未使用主题自己的嵌套依赖。`);
    }
  }

  // Layout 与正文按包名导入的主题组件共享同一个主题模块实例。
  await useTheme('theme-context');

  await writeTheme('theme-context', 'src/index.tsx', {
    'src/index.tsx': `import { useContext } from 'react';\nimport type { ReactNode } from 'react';\nimport { ThemeContext } from './context.ts';\n\nexport function Badge() {\n  return <span data-badge>{useContext(ThemeContext)}</span>;\n}\n\nexport default function Layout({ children }: { children?: ReactNode }) {\n  return (\n    <ThemeContext value="BOUND">\n      <div data-theme="context">{children}</div>\n    </ThemeContext>\n  );\n}\n`,
    'src/context.ts': `import { createContext } from 'react';\n\nexport const ThemeContext = createContext('MISSING');\n`,
  });

  await writePage(
    "import { Badge } from 'theme-context';\n\n# Page\n\n<Badge />\n",
  );

  const identity = await renderHtml(
    await createBuild(root, { development: true }),
  );

  if (
    !identity.includes('data-badge="true"') ||
    !identity.includes('BOUND') ||
    identity.includes('MISSING')
  ) {
    throw new Error('Layout 与正文组件未共享同一个主题模块实例。');
  }

  // 主题根入口的条件导出：Layout 与正文包名导入共享同一份主题模块。
  await useTheme('theme-conditional');

  const conditionalEntry = (kind: string) =>
    `import { createContext, useContext } from 'react';\nimport type { ReactNode } from 'react';\n\nconst ThemeContext = createContext('MISSING_${kind.toUpperCase()}');\n\nexport function Badge() {\n  return <span data-badge>{useContext(ThemeContext)}</span>;\n}\n\nexport default function Layout({ children }: { children?: ReactNode }) {\n  return (\n    <ThemeContext value="BOUND">\n      <div data-theme="conditional">{children}</div>\n    </ThemeContext>\n  );\n}\n`;

  await writeTheme('theme-conditional', 'runtime.tsx', {
    'runtime.tsx': conditionalEntry('runtime'),
    'browser.tsx': conditionalEntry('browser'),
  });

  await writeFile(
    join(nodeModules, 'theme-conditional/package.json'),
    JSON.stringify({
      name: 'theme-conditional',
      type: 'module',
      exports: {
        '.': {
          browser: './browser.tsx',
          default: './runtime.tsx',
        },
      },
    }),
  );

  await writePage(
    "import { Badge } from 'theme-conditional';\n\n# Page\n\n<Badge />\n",
  );

  const conditional = await createBuild(root);

  if (!(await renderHtml(conditional)).includes('BOUND')) {
    throw new Error('条件导出主题的 Layout 与正文组件未共享同一个主题模块。');
  }

  const clientCode = (
    await Promise.all(
      [...conditional.files.entries()]
        .filter(([path]) => path.startsWith('_phyllo/') && path.endsWith('.js'))
        .map(async ([, value]) =>
          typeof value === 'string' ? value : await value.text(),
        ),
    )
  ).join('\n');

  if (!clientCode.includes('MISSING_BROWSER')) {
    throw new Error('浏览器产物未使用主题的 browser 条件入口。');
  }

  if (clientCode.includes('MISSING_RUNTIME')) {
    throw new Error('浏览器产物同时包含主题的运行时入口，模块实例分裂。');
  }

  // 原生打包器的实际输入模块与目标条件一致。
  const targetEntry = join(root, 'theme-conditional-entry.ts');

  await writeFile(targetEntry, "export { Badge } from 'theme-conditional';\n");

  for (const [target, expected] of [
    ['browser', 'browser.tsx'],
    ['bun', 'runtime.tsx'],
  ] as const) {
    const result = await Bun.build({
      entrypoints: [targetEntry],
      target,
      metafile: true,
    });

    if (!result.success) {
      throw new AggregateError(result.logs, `${target} 目标打包失败。`);
    }
    const inputs = Object.keys(result.metafile?.inputs ?? {});

    if (!inputs.some(input => input.endsWith(expected))) {
      throw new Error(`${target} 目标未选择主题的 ${expected} 入口。`);
    }

    if (
      inputs.some(input =>
        input.endsWith(
          expected === 'browser.tsx' ? 'runtime.tsx' : 'browser.tsx',
        ),
      )
    ) {
      throw new Error(`${target} 目标同时包含两个主题入口。`);
    }
  }

  // 只修改 JS 导入的 SVG，开发媒体地址随重建更新并与生产一致。
  await useTheme('theme-asset');

  await writeTheme('theme-asset', 'src/index.tsx', {
    'src/index.tsx': `import icon from './icon.svg';\nimport type { ReactNode } from 'react';\n\nexport default function Layout({ children }: { children?: ReactNode }) {\n  return (\n    <div data-theme="asset">\n      <img src={icon} data-icon />\n      {children}\n    </div>\n  );\n}\n`,
    'src/icon.svg': '<svg><!--one--></svg>\n',
  });

  const assetFirst = await createBuild(root, { development: true });
  const firstUrl = /(\/_phyllo\/media\/[a-z0-9]+\.svg)/.exec(
    await renderHtml(assetFirst),
  )?.[1];

  if (firstUrl === undefined) {
    throw new Error('开发构建未生成主题图片地址。');
  }

  await Bun.sleep(10);

  await writeFile(
    join(nodeModules, 'theme-asset/src/icon.svg'),
    '<svg><!--two--></svg>\n',
  );

  const assetSecond = await createBuild(root, {
    development: true,
    previous: assetFirst,
  });
  const secondUrl = /(\/_phyllo\/media\/[a-z0-9]+\.svg)/.exec(
    await renderHtml(assetSecond),
  )?.[1];
  const prodUrl = /(\/_phyllo\/media\/[a-z0-9]+\.svg)/.exec(
    await renderHtml(await createBuild(root)),
  )?.[1];

  if (secondUrl === undefined || secondUrl === firstUrl) {
    throw new Error('单独修改主题图片后开发媒体地址未更新。');
  }

  if (prodUrl !== secondUrl) {
    throw new Error('开发与生产的主题图片地址不一致。');
  }

  // 依赖目录内的 .mjs 与 .mts 入口按原生语义加载。
  await useTheme('theme-mjs');

  await writeTheme('theme-mjs', 'src/index.mjs', {
    'src/index.mjs': jsLayout('mjs'),
  });

  if (
    !(
      await renderHtml(await createBuild(root, { development: true }))
    ).includes('data-theme="mjs"')
  ) {
    throw new Error('.mjs 主题未渲染。');
  }

  await useTheme('theme-mts');

  await writeTheme('theme-mts', 'src/index.mts', {
    'src/index.mts': tsLayout('mts'),
  });

  if (
    !(
      await renderHtml(await createBuild(root, { development: true }))
    ).includes('data-theme="mts"')
  ) {
    throw new Error('.mts 主题未渲染。');
  }

  // 符号链接到站点外的本地主题保持原生加载。
  await mkdir(join(root, 'theme-local/src'), { recursive: true });

  await writeFile(
    join(root, 'theme-local/package.json'),
    JSON.stringify({
      name: 'theme-local',
      type: 'module',
      exports: './src/index.tsx',
    }),
  );
  await writeFile(join(root, 'theme-local/src/index.tsx'), tsxLayout('local'));
  await symlink(join(root, 'theme-local'), join(nodeModules, 'theme-local'));
  await useTheme('theme-local');

  if (
    !(
      await renderHtml(await createBuild(root, { development: true }))
    ).includes('data-theme="local"')
  ) {
    throw new Error('本地主题未渲染。');
  }

  // 依赖目录内的主题：浏览器字段映射与原生构建一致。
  await useTheme('theme-nm');

  await writeTheme('theme-nm', 'src/index.tsx', {
    'src/index.tsx': `import './runtime.js';\nimport type { ReactNode } from 'react';\n\nexport default function Layout({ children }: { children?: ReactNode }) {\n  return <div data-theme="nm">{children}</div>;\n}\n`,
    'src/runtime.js': `globalThis.__runtimeSource = 'RUNTIME_SOURCE';\n`,
    'src/runtime.browser.js': `globalThis.__runtimeSource = 'BROWSER_SOURCE';\n`,
  });

  await writeFile(
    join(nodeModules, 'theme-nm/package.json'),
    JSON.stringify({
      name: 'theme-nm',
      type: 'module',
      exports: './src/index.tsx',
      browser: { './src/runtime.js': './src/runtime.browser.js' },
    }),
  );

  const native = await Bun.build({
    entrypoints: [join(nodeModules, 'theme-nm/src/index.tsx')],
    target: 'browser',
  });

  if (!native.success) {
    throw new AggregateError(native.logs, '主题的原生浏览器构建失败。');
  }
  const nativeCode = await native.outputs[0]!.text();

  if (
    !nativeCode.includes('BROWSER_SOURCE') ||
    nativeCode.includes('RUNTIME_SOURCE')
  ) {
    throw new Error('原生浏览器构建未按 browser 字段选择主题源码。');
  }

  // 站点外主题的监听范围：已安装主题不监听，本地主题保持原生监听。
  await mkdir(join(outer, 'node_modules/theme-hoisted/src'), {
    recursive: true,
  });

  await writeFile(
    join(outer, 'node_modules/theme-hoisted/package.json'),
    JSON.stringify({
      name: 'theme-hoisted',
      type: 'module',
      exports: './src/index.tsx',
    }),
  );

  await writeFile(
    join(outer, 'node_modules/theme-hoisted/src/index.tsx'),
    plainLayout('HOISTED_ONE'),
  );

  await symlink(
    join(outer, 'node_modules/theme-hoisted'),
    join(nodeModules, 'theme-hoisted'),
  );

  await mkdir(join(outer, 'theme-external/src'), { recursive: true });

  await writeFile(
    join(outer, 'theme-external/package.json'),
    JSON.stringify({
      name: 'theme-external',
      type: 'module',
      exports: './src/index.tsx',
    }),
  );

  await writeFile(
    join(outer, 'theme-external/src/index.tsx'),
    plainLayout('EXTERNAL_ONE'),
  );

  await symlink(
    join(outer, 'theme-external'),
    join(nodeModules, 'theme-external'),
  );

  const server = await dev(root, { port: 0 });

  try {
    const bundle = await clientBundle(server, AbortSignal.timeout(20_000));

    if (
      !bundle.includes('BROWSER_SOURCE') ||
      bundle.includes('RUNTIME_SOURCE')
    ) {
      throw new Error('开发客户端产物未按 browser 字段选择主题源码。');
    }

    // 站点外的已安装主题：不监听，服务端与客户端保持一致。
    await useTheme('theme-hoisted');
    await waitForPage(server, 'HOISTED_ONE');

    if (
      !(await clientBundle(server, AbortSignal.timeout(20_000))).includes(
        'HOISTED_ONE',
      )
    ) {
      throw new Error('站点外的已安装主题未进入客户端产物。');
    }

    await Bun.sleep(10);

    await writeFile(
      join(outer, 'node_modules/theme-hoisted/src/index.tsx'),
      plainLayout('HOISTED_TWO'),
    );
    await Bun.sleep(2000);

    const hoistedPage = await (
      await fetch(new URL('/page', server.url), {
        signal: AbortSignal.timeout(20_000),
      })
    ).text();
    const hoistedBundle = await clientBundle(
      server,
      AbortSignal.timeout(20_000),
    );

    if (
      hoistedPage.includes('HOISTED_TWO') ||
      hoistedBundle.includes('HOISTED_TWO')
    ) {
      throw new Error('站点外的已安装主题不应被开发服务监听。');
    }

    // 站点外的本地主题：保持原生监听，页面与客户端都更新。
    await useTheme('theme-external');
    await waitForPage(server, 'EXTERNAL_ONE');

    await Bun.sleep(10);

    await writeFile(
      join(outer, 'theme-external/src/index.tsx'),
      plainLayout('EXTERNAL_TWO'),
    );

    await waitForPage(server, 'EXTERNAL_TWO');
    await waitForBundle(server, 'EXTERNAL_TWO');
  } finally {
    await server.stop();
  }

  // 站点内主题包与输出目录重叠：构建失败，主题资源与已有产物保留。
  const conflictTheme = join(root, 'conflict-theme');

  await mkdir(join(conflictTheme, 'src'), { recursive: true });
  await mkdir(join(conflictTheme, 'media'), { recursive: true });

  await writeFile(
    join(conflictTheme, 'package.json'),
    JSON.stringify({
      name: 'theme-conflict',
      type: 'module',
      exports: './src/index.tsx',
    }),
  );

  await writeFile(
    join(conflictTheme, 'src/index.tsx'),
    `import type { ReactNode } from 'react';\n\nexport default function Layout({ children }: { children?: ReactNode }) {\n  return <div data-theme="conflict">{children}</div>;\n}\n`,
  );
  await writeFile(join(conflictTheme, 'media/icon.svg'), '<svg></svg>\n');
  await writeFile(join(conflictTheme, 'media/existing.txt'), 'existing\n');
  await symlink(conflictTheme, join(nodeModules, 'theme-conflict'));

  await writeFile(
    join(root, 'phyllo.config.ts'),
    `import { defineConfig } from '@phyllo/core';\n\nexport default defineConfig({ theme: 'theme-conflict', outdir: 'conflict-theme/media' });\n`,
  );

  let overlapError = false;

  try {
    await createBuild(root, { development: true });
  } catch (error) {
    overlapError = String(error).includes(
      'outdir must not overlap the theme package.',
    );
  }

  if (!overlapError) {
    throw new Error('输出目录与站点内主题包重叠时未报错。');
  }

  for (const path of ['media/icon.svg', 'media/existing.txt']) {
    if (!(await file(join(conflictTheme, path)).exists())) {
      throw new Error(`冲突报错后主题资源被删除：${path}`);
    }
  }

  // 主题包内的示例站点输出不受保护规则影响。
  const exampleTheme = join(root, 'example-theme');
  const exampleSite = join(exampleTheme, 'example');

  await mkdir(join(exampleTheme, 'src'), { recursive: true });
  await mkdir(join(exampleSite, 'content'), { recursive: true });

  await writeFile(
    join(exampleTheme, 'package.json'),
    JSON.stringify({
      name: 'theme-example',
      type: 'module',
      exports: './src/index.tsx',
    }),
  );

  await writeFile(
    join(exampleTheme, 'src/index.tsx'),
    `import type { ReactNode } from 'react';\n\nexport default function Layout({ children }: { children?: ReactNode }) {\n  return <div data-theme="example">{children}</div>;\n}\n`,
  );

  await writeFile(
    join(exampleSite, 'phyllo.config.ts'),
    `import { defineConfig } from '@phyllo/core';\n\nexport default defineConfig({ theme: 'theme-example' });\n`,
  );

  await writeFile(
    join(exampleSite, 'content/page.mdx'),
    '# Example\n\nEXAMPLE_BODY\n',
  );

  const exampleModules = join(exampleSite, 'node_modules');

  await mkdir(join(exampleModules, '@phyllo'), { recursive: true });
  await symlink(join(repo, 'packages/phyllo'), join(exampleModules, 'phyllo'));

  await symlink(
    join(repo, 'packages/core'),
    join(exampleModules, '@phyllo/core'),
  );

  await symlink(
    join(repo, 'docs/node_modules/react'),
    join(exampleModules, 'react'),
  );

  await symlink(
    join(repo, 'docs/node_modules/react-dom'),
    join(exampleModules, 'react-dom'),
  );
  await symlink(exampleTheme, join(exampleModules, 'theme-example'));

  const example = await createBuild(exampleSite, { development: true });

  if (!(await renderHtml(example)).includes('data-theme="example"')) {
    throw new Error('主题包内的示例站点未渲染。');
  }

  console.log(
    '主题来源验证通过：主题按包名导入并由打包器按目标解析条件入口，Layout 与正文包名导入共享同一份主题模块，开发与生产使用同一份依赖，嵌套源码与 JS 导入的图片随重建更新，browser 字段映射与原生构建一致，本地主题保持原生加载，站点外已安装主题不被监听，.mjs 与 .mts 入口语义不变，站点内主题包的输出目录冲突被拒绝且资源保留',
  );
} finally {
  await rm(root, { recursive: true, force: true });
  await rm(outer, { recursive: true, force: true });
}
