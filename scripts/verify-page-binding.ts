import { mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { contentPlugin } from '../packages/core/src/build/plugin';
import { createCompiler } from '../packages/core/src/content/compile';
import type { Frontmatter, PageData } from '../packages/phyllo/src/data';

import { verifyProject } from './verify-project';

/**
 * 验证当前页面绑定：
 *
 * - 服务端与浏览器分别解析到条件入口，浏览器产物不含服务端作用域实现；
 * - 生成入口与公共 Hooks 使用同一份存储（模块实例一致）；
 * - 服务端作用域覆盖异步边界与并发，作用域外读取报错，异常不污染后续渲染；
 * - 浏览器绑定在回调结束后保持可读；
 * - `useFrontmatter()` 读取宿主页面。
 *
 * 需要真实打包与运行，按项目规范放在独立脚本中执行。
 */
const root = await realpath(
  await mkdtemp(join(tmpdir(), 'phyllo-page-binding-')),
);

interface BindingModule {
  runWithPage: <T>(page: PageData, render: () => T) => T;
  getCurrentPage: () => PageData;
  usePage: () => PageData;
  useFrontmatter: <T extends Frontmatter = Frontmatter>() => T;
}

/**
 * 用内容插件打包绑定入口，并加载产物。
 *
 * @param target - 打包目标。
 * @returns 产物代码与模块导出。
 * @throws 打包失败时抛出错误。
 */
async function bundle(target: 'bun' | 'browser') {
  const project = verifyProject(root);
  const entry = join(root, `entry.${target}.ts`);

  await writeFile(
    entry,
    [
      "export { useFrontmatter, usePage } from 'phyllo';",
      "export { getCurrentPage, runWithPage } from 'phyllo/page';",
      '',
    ].join('\n'),
  );

  const result = await Bun.build({
    entrypoints: [entry],
    target,
    plugins: [
      contentPlugin({
        project,
        compile: createCompiler(project),
        files: new Map(),
      }),
    ],
  });

  if (!result.success) {
    throw new AggregateError(result.logs, `${target} 目标打包失败。`);
  }
  const [output] = result.outputs;

  if (!output) {
    throw new Error(`${target} 目标没有产物。`);
  }
  const code = await output.text();
  const file = join(root, `bundle.${target}.mjs`);

  await writeFile(file, code);

  return { code, module: (await import(file)) as BindingModule };
}

const pageA: PageData = {
  url: '/a',
  title: 'A',
  frontmatter: { title: 'A' },
  hasContent: true,
};
const pageB: PageData = {
  url: '/b',
  title: 'B',
  frontmatter: { title: 'B' },
  hasContent: true,
};

try {
  await symlink(
    join(import.meta.dir, '../docs/node_modules'),
    join(root, 'node_modules'),
  );

  const browser = await bundle('browser');
  const server = await bundle('bun');

  // 构建目标选择正确实现。
  if (
    browser.code.includes('AsyncLocalStorage') ||
    browser.code.includes('async_hooks')
  ) {
    throw new Error('浏览器产物包含服务端作用域实现。');
  }

  if (!server.code.includes('AsyncLocalStorage')) {
    throw new Error('服务端产物没有使用 AsyncLocalStorage。');
  }

  // 模块实例一致：绑定方与读取方共享同一份存储。
  const browserPage = browser.module.runWithPage(pageA, () =>
    browser.module.usePage(),
  );

  if (browserPage.url !== '/a') {
    throw new Error('浏览器绑定没有生效。');
  }

  // 浏览器绑定在回调结束后保持可读。
  if (browser.module.getCurrentPage().url !== '/a') {
    throw new Error('浏览器绑定在回调结束后丢失。');
  }

  // 服务端异步边界与并发：两个页面各自读取。
  const [a, b] = await Promise.all([
    server.module.runWithPage(pageA, async () => {
      await Bun.sleep(20);

      return server.module.usePage().url;
    }),
    server.module.runWithPage(pageB, async () => {
      await Bun.sleep(5);

      return server.module.usePage().url;
    }),
  ]);

  if (a !== '/a' || b !== '/b') {
    throw new Error(`并发渲染串用页面：${a}、${b}`);
  }

  // 服务端作用域外读取报错。
  let outside = false;

  try {
    server.module.getCurrentPage();
  } catch {
    outside = true;
  }

  if (!outside) {
    throw new Error('服务端作用域外读取未报错。');
  }

  // 异常不污染后续渲染。
  try {
    server.module.runWithPage(pageA, () => {
      throw new Error('boom');
    });
  } catch {
    // 预期错误。
  }
  const after = server.module.runWithPage(
    pageB,
    () => server.module.getCurrentPage().url,
  );

  if (after !== '/b') {
    throw new Error('异常污染了页面作用域。');
  }

  // useFrontmatter 读取宿主页面。
  const frontmatter = browser.module.runWithPage(pageA, () =>
    browser.module.useFrontmatter(),
  );

  if (frontmatter.title !== 'A') {
    throw new Error('useFrontmatter 未读取宿主页面。');
  }

  // 带构建目标条件入口的 react-dom 子路径按目标原生解析。
  const runtimeEntry = join(root, 'runtime-conditions.ts');

  await writeFile(
    runtimeEntry,
    [
      "export { prerender } from 'react-dom/static';",
      "export { renderToStaticMarkup } from 'react-dom/server';",
      '',
    ].join('\n'),
  );

  for (const target of ['browser', 'bun'] as const) {
    const project = verifyProject(root);
    const native = await Bun.build({ entrypoints: [runtimeEntry], target });
    const plugin = await Bun.build({
      entrypoints: [runtimeEntry],
      target,
      plugins: [
        contentPlugin({
          project,
          compile: createCompiler(project),
          files: new Map(),
        }),
      ],
    });

    if (!native.success) {
      throw new AggregateError(native.logs, `${target} 目标原生打包失败。`);
    }

    if (!plugin.success) {
      throw new AggregateError(
        plugin.logs,
        `${target} 目标在 Phyllo 插件下打包失败。`,
      );
    }
    const code = await plugin.outputs[0]!.text();

    if (target === 'browser' && code.includes('async_hooks')) {
      throw new Error('浏览器产物选择了服务端条件入口。');
    }
  }

  console.log(
    '当前页面绑定验证通过：条件解析、模块实例、异步并发、作用域语义、宿主 frontmatter 与 react-dom 目标条件入口',
  );
} finally {
  await rm(root, { recursive: true, force: true });
}
