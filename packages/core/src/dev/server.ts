import {
  type BunPlugin,
  type HTMLBundle,
  type ImportKind,
  argv,
  file,
  hash,
  resolveSync,
  serve,
} from 'bun';
import { watch } from 'node:fs';
import { realpath, rm } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';

import type { HeadTag } from 'phyllo';
import { find, hastToReact, html } from 'property-information';

import { type ContentRange, type SiteBuild, createBuild } from '../build';
import { ASSET_MODULE, assetModule } from '../build/assets';
import { loadProject } from '../config/project';
import {
  ContentCompileError,
  ContentRouteError,
  logicalContentFile,
} from '../content';
import { loadContent } from '../content/compile';
import { writeIfChanged } from '../utils/fs';
import { findPackageRoot, isWithin } from '../utils/path';

import { assetModulePath, assetSources } from './assets';
import { contentBridgePath, contentSources } from './content';

import type { DevOptions } from './index';

/**
 * 开发服务器。既作为 Bun 的静态插件模块（.phyllo/bunfig.toml 的 [serve.static]），
 * 也作为 dev/index.ts 启动的子进程入口，两种角色共享以下状态。
 */
interface DevServerState {
  /** 当前站点构建结果。 */
  build?: SiteBuild;
  /** 最新一次重建的全局错误，存在时所有请求都失败。 */
  error?: unknown;
  /** 正在进行的重建。 */
  pending?: Promise<void>;
  /** 是否有变化等待重建。 */
  dirty: boolean;
  /** 服务器是否已停止。 */
  closed: boolean;
}

const state: DevServerState = { dirty: false, closed: false };

/** 桥接目标模块的命名空间。 */
const CONTENT_NAMESPACE = 'phyllo-content';

/**
 * 生成资源模块文件：导入结果指向统一的内容哈希地址。
 *
 * @param source - 资源文件的绝对路径。
 * @returns 生成模块的绝对路径。
 * @throws 资源文件不存在时抛出错误。
 */
async function assetModuleFile(source: string): Promise<string> {
  if (!(await file(source).exists())) {
    throw new Error(`Cannot find asset: ${source}`);
  }
  const build = state.build!;
  const generated = assetModulePath(build.project.workDir, source);

  assetSources.add(source);

  await writeIfChanged(
    generated,
    await assetModule(build.project, source, build.files),
  );

  return generated;
}

/**
 * 生成内容桥接模块：导出目标带编译结果哈希。
 *
 * 编译成功才重写桥接模块。编译失败时直接抛出：加载钩子让错误交给 Bun 原生反馈，
 * 主动刷新由调用方保留上次可用的桥接，错误仍由服务端构建与打包器在引用时报告。
 *
 * 导出目标使用真实路径，解析保持打包器原生行为；编译按真实目录映射出的逻辑路径
 * 进行，页面地址与相对链接保持在 `content/` 下。
 *
 * @param source - 内容源文件的逻辑路径。
 * @returns 桥接模块的绝对路径。
 * @throws 编译失败时抛出错误。
 */
async function contentBridgeFile(source: string): Promise<string> {
  const build = state.build!;
  const bridge = contentBridgePath(build.project.workDir, source);
  const result = await loadContent(source, build.compile, build.files);
  const real = await realpath(source);
  const target = `${real}?phyllo-content=${hash(result.code).toString(16)}`;

  contentSources.add(source);

  await writeIfChanged(
    bridge,
    `export * from ${JSON.stringify(target)};\nexport { default } from ${JSON.stringify(target)};\n`,
  );

  return bridge;
}

/**
 * 判断导入类型是否由 JavaScript 发起，CSS 的 url() 与 @import 保持原生处理。
 *
 * @param kind - 导入类型。
 * @returns 由 JavaScript 发起时为 `true`。
 */
function isJavaScriptImport(kind: ImportKind) {
  return (
    kind === 'import-statement' ||
    kind === 'dynamic-import' ||
    kind === 'require-call'
  );
}

/**
 * HTML 属性名到 React DOM 属性名的映射。
 *
 * Bun 开发服务器生成的 head 标签使用 HTML 属性名，React 只接受别名形式；
 * 布尔属性存在时转换为布尔值，未定义的属性保留原名。
 *
 * @param name - HTML 属性名。
 * @param value - 属性值。
 * @returns React 属性名与转换后的值。
 */
export function reactAttribute(name: string, value: string) {
  const info = find(html, name);
  const property = info.space
    ? (hastToReact[info.property] ?? info.property)
    : info.attribute;

  return {
    property,
    value: info.boolean && value === '' ? true : value,
  };
}

/**
 * 开发热更新插件：内容经桥接模块加载，资源统一到内容哈希地址。
 *
 * 模块解析全部交给打包器（条件、作用域、浏览器映射与扩展名替换）；`#` 映射的
 * 图片为统一内容哈希地址，仍按运行时条件解析。HMR 由 Bun 的文件监听驱动：桥接
 * 模块随编译结果更新，图片生成模块随资源内容更新。
 *
 * 插件在构建就绪后才会加载模块：首次构建失败时客户端入口是空模块，不会触发
 * 这些解析与加载钩子，生成函数里的构建状态因此可以直接使用。
 */
export default {
  name: 'phyllo',
  setup(builder) {
    // 桥接目标使用独立命名空间加载，避免与页面模块的身份过滤器重叠。
    builder.onResolve({ filter: /\?phyllo-content=/ }, args => ({
      path: args.path,
      namespace: CONTENT_NAMESPACE,
    }));

    builder.onLoad(
      { filter: /.*/, namespace: CONTENT_NAMESPACE },
      async args => {
        const build = state.build;

        if (!build) {
          return;
        }
        const separator = args.path.indexOf('?phyllo-content=');
        const source = logicalContentFile(
          args.path.slice(0, separator),
          build.directories,
        );
        const result = await loadContent(source, build.compile, build.files);

        return { contents: result.code, loader: 'jsx' };
      },
    );

    // 内容模块按真实位置加载；编译按真实目录映射出的逻辑路径进行，只再导出桥接模块。
    builder.onLoad({ filter: /\.mdx?$/ }, async args => {
      const build = state.build;

      if (!build) {
        return;
      }
      const source = logicalContentFile(args.path, build.directories);
      const bridge = await contentBridgeFile(source);

      return {
        contents: `export * from ${JSON.stringify(bridge)};\nexport { default } from ${JSON.stringify(bridge)};\n`,
        loader: 'js',
      };
    });

    // `#` 导入的图片统一到内容哈希地址，其余说明符交给打包器原生解析。
    builder.onResolve({ filter: /^#/ }, async args => {
      if (!isJavaScriptImport(args.kind)) {
        return;
      }
      let resolved: string;

      try {
        resolved = resolveSync(args.path, args.resolveDir);
      } catch {
        // 解析不了的说明符交给打包器报错。
        return;
      }

      if (!ASSET_MODULE.test(resolved)) {
        return;
      }
      return { path: await assetModuleFile(resolved) };
    });

    // 主题从 JS 导入的图片重定向到生成模块，资源变化时以文件更新驱动热更新。
    builder.onResolve({ filter: ASSET_MODULE }, async args => {
      if (!isJavaScriptImport(args.kind)) {
        return;
      }
      return {
        path: await assetModuleFile(resolveSync(args.path, args.resolveDir)),
      };
    });
  },
} satisfies BunPlugin;

const ENTRY_SOURCE = [
  '<!doctype html>',
  '<html>',
  '  <head>',
  /*
   * 入口脚本使用不带 ./ 前缀的相对地址：Bun 的 HTML 入口解析在插件 onResolve
   * 匹配到说明符后不会继续回退，避免外层插件过滤器无意匹配入口脚本。
   */
  '    <script type="module" src="client.ts"></script>',
  '  </head>',
  '  <body></body>',
  '</html>',
  '',
].join('\n');

const CLIENT_STUB = [
  '// 首次构建成功前占位，createBuild 会写入真正的客户端入口。',
  'export {};',
  '',
].join('\n');

/**
 * 开发服务器的请求状态，由最近一次构建结果和错误组成。
 */
export interface DevRequestState {
  /** 最新一次重建的全局错误，存在时所有请求都失败。 */
  error?: unknown;
  /** 按页面地址隔离的内容错误。 */
  failures: ReadonlyMap<string, unknown>;
  /** 重定向来源到最终目标地址的映射。 */
  redirects: ReadonlyMap<string, string>;
  /** 别名到规范地址的映射。 */
  aliases: ReadonlyMap<string, string>;
  /** 页面地址到输出文件名的映射。 */
  routes: ReadonlyMap<string, string>;
  /** 待提供的文件。 */
  files: ReadonlyMap<string, Blob | string>;
}

/**
 * 请求路径对应的处理目标。
 */
export type DevRequestTarget =
  | { type: 'error'; error: unknown }
  | { type: 'redirect'; destination: string }
  | { type: 'alias'; target: string }
  | { type: 'page'; url: string }
  | { type: 'file'; content: Blob }
  | { type: 'missing' };

/**
 * 按全局错误、按 URL 失败、重定向、别名、页面、静态文件的优先级解析请求路径。
 *
 * @remarks
 * pathname 使用网络形式，保留百分号编码，与路由表的键一致；
 * 输出文件按解码后的路径存放，只在查找 files 时解码。
 *
 * @param pathname - 请求路径。
 * @param state - 当前构建状态。
 * @returns 请求对应的处理目标。
 */
export function resolveRequest(
  pathname: string,
  state: DevRequestState,
): DevRequestTarget {
  if (state.error !== undefined) {
    return { type: 'error', error: state.error };
  }
  const failure = state.failures.get(pathname);

  if (failure !== undefined) {
    return { type: 'error', error: failure };
  }
  const destination = state.redirects.get(pathname);

  if (destination !== undefined) {
    return { type: 'redirect', destination };
  }
  const alias = state.aliases.get(pathname);

  if (alias !== undefined) {
    return { type: 'alias', target: alias };
  }

  if (state.routes.has(pathname)) {
    return { type: 'page', url: pathname };
  }
  const path = decodePath(pathname);
  const content =
    path === undefined ? undefined : state.files.get(path.slice(1));

  if (content === undefined || typeof content === 'string') {
    return { type: 'missing' };
  }
  return { type: 'file', content };
}

/**
 * 输出文件使用解码后的路径，网络路径在这里换算。
 *
 * @param pathname - 请求路径。
 * @returns 解码后的路径，编码不合法时为 `undefined`。
 */
function decodePath(pathname: string): string | undefined {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return undefined;
  }
}

/**
 * 启动开发服务器：重建站点、监听文件并以请求路径分发响应。
 *
 * @param directory - 站点根目录。
 * @param options - 开发服务器选项。
 */
async function startServer(directory: string, options: DevOptions) {
  // 站内路径统一使用真实路径，避免符号链接路径与工程解析结果不一致时入口模块无法加载。
  const root = await realpath(resolve(directory));
  const watchers: ReturnType<typeof watch>[] = [];
  const watching = new Set<string>();
  const failures = new Map<string, unknown>();

  /**
   * 内容范围：内容目录与目录链接映射出的真实目录。
   *
   * 每轮构建在内容编译前通过 onContentRange 更新；工程信息或目录映射无法
   * 解析时保留上次结果，隐藏片段的修复才能在出错后触发重建。
   */
  let contentRange:
    | {
        root: string;
        directories: ReadonlySet<string>;
        workDir: string;
        outdir: string;
      }
    | undefined;

  /**
   * 记录全局错误，并把内容错误按页面地址隔离。
   *
   * @param error - 原始错误。
   */
  function reportError(error: unknown) {
    console.error(error);
    state.error = error;
    failures.clear();

    if (error instanceof ContentCompileError) {
      for (const failure of error.failures) {
        failures.set(failure.url, failure.error);
      }
    } else if (error instanceof ContentRouteError) {
      for (const conflict of error.conflicts) {
        failures.set(conflict.url, error);
      }
    }
  }

  /**
   * 记录本轮构建解析出的内容范围。
   *
   * @param range - 已解析的工程信息与真实目录到逻辑目录的映射。
   */
  function updateContentRange(range: ContentRange) {
    contentRange = {
      root: range.project.content,
      directories: new Set(range.directories.keys()),
      workDir: range.project.workDir,
      outdir: range.project.outdir,
    };
  }

  /**
   * 判断变化路径是否属于支持的内容源：`content/` 内，或目录链接的真实映射目录下。
   *
   * 隐藏片段目录（如 `.fragments`）属于支持的内容导入，需要参与服务端重建。
   *
   * @param changed - 变化的绝对路径。
   * @returns 属于内容源时为 `true`。
   */
  function isContentSource(changed: string) {
    const range = contentRange;

    if (!range) {
      return false;
    }

    if (isWithin(range.root, changed)) {
      return true;
    }
    let current = dirname(changed);

    for (;;) {
      if (range.directories.has(current)) {
        return true;
      }
      const parent = dirname(current);

      if (parent === current) {
        return false;
      }
      current = parent;
    }
  }

  /**
   * 监听目录及其子目录，内容变化时触发重建。
   *
   * @param path - 要监听的目录路径。
   */
  function watchRoot(path: string) {
    if (watching.has(path)) {
      return;
    }
    watching.add(path);

    watchers.push(
      watch(path, { recursive: true }, (_event, filename) => {
        if (filename) {
          const changed = resolve(path, filename);
          const parts = relative(path, changed).split(sep);
          const build = state.build;
          /*
           * 生成文件与输出目录按最新解析的真实范围排除，不依赖目录名形态；
           * 构建失败时 state.build 仍是上一次成功构建，不能覆盖本轮解析结果。
           */
          const workDir = contentRange?.workDir ?? build?.project.workDir;
          const outdir = contentRange?.outdir ?? build?.project.outdir;

          if (
            (workDir !== undefined && isWithin(workDir, changed)) ||
            (outdir !== undefined && isWithin(outdir, changed)) ||
            parts.includes('node_modules') ||
            (parts.some(part => part.startsWith('.')) &&
              !isContentSource(changed)) ||
            (build &&
              changed.endsWith('.css') &&
              !isWithin(join(build.project.root, 'public'), changed) &&
              !isContentSource(changed))
          ) {
            return;
          }
        }
        rebuild();
      }).on('error', console.error),
    );
  }

  /**
   * 站点外的主题源码不在项目监听范围内，需要单独监听。
   *
   * 依赖目录内的主题不单独监听：开发打包器按真实路径缓存这些模块，
   * 监听只会让服务端与客户端产物分叉，主题源码改动后需要重启开发服务。
   *
   * @param themeRoot - 主题包目录。
   * @param root - 站点根目录。
   */
  function watchTheme(themeRoot: string, root: string) {
    if (
      themeRoot.split(sep).includes('node_modules') ||
      isWithin(root, themeRoot)
    ) {
      return;
    }
    watchRoot(themeRoot);
  }

  /**
   * 把站内路径转换成绕过 DNS 解析的服务地址。
   *
   * @param pathname - 站内路径。
   * @returns 指向当前服务器的绝对地址。
   */
  function localUrl(pathname: string): URL {
    const url = new URL(pathname, server.url);

    if (url.hostname === '0.0.0.0') {
      url.hostname = '127.0.0.1';
    }
    return url;
  }

  /**
   * 渲染单个页面：先取回 Bun 处理后的 HTML，再交给主题渲染。
   *
   * @param build - 当前站点构建结果。
   * @param url - 页面地址。
   * @returns 页面响应。
   */
  async function renderPage(build: SiteBuild, url: string): Promise<Response> {
    /*
     * Bun 没有公开开发服务器处理后的 HTML（HTMLBundle.index 只是源文件路径），
     * 只能通过内部请求拿到带 HMR 脚本和资源哈希的页面。
     * 模块加载、样式和热更新交给 Bun，页面 HTML 由 Phyllo 在服务端渲染。
     */
    const response = await fetch(localUrl('/_phyllo/client'));

    if (!response.ok) {
      return response;
    }
    const head = {
      tags: [] as HeadTag[],
      current: undefined as HeadTag | undefined,
    };

    await new HTMLRewriter()
      .on('head > script, head > link, head > style', {
        element(element) {
          const attrs: HeadTag['attrs'] = {};

          for (const [name, value] of element.attributes) {
            const converted = reactAttribute(name, value);

            attrs[converted.property] = converted.value;
          }
          const tag = {
            tag: element.tagName as HeadTag['tag'],
            attrs,
          };

          head.current = tag;
          head.tags.push(tag);
        },
        text(chunk) {
          const tag = head.current!;

          tag.textContent = (tag.textContent ?? '') + chunk.text;
        },
      })
      .transform(response)
      .text();

    return new Response(
      await build.render(url, {
        styles: [],
        scripts: [],
        head: [...build.project.head, ...head.tags],
      }),
      {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
        },
      },
    );
  }

  /**
   * 页面响应需要主题服务端渲染，且路由随内容增删变化，因此按请求分发而不是注册固定路由。
   *
   * @param request - 开发服务器的请求。
   * @returns 页面、文件或跳转响应。
   */
  async function handleRequest(request: Request): Promise<Response> {
    if (!['GET', 'HEAD'].includes(request.method)) {
      return new Response('Method not allowed', {
        status: 405,
        headers: { Allow: 'GET, HEAD' },
      });
    }
    await state.pending;

    const build = state.build;

    if (!build) {
      throw state.error ?? new Error('The development server is not ready.');
    }
    const pathname = new URL(request.url).pathname;
    // failures 为空表示最新一次重建是全局错误，没有可以隔离的 URL。
    const target = resolveRequest(pathname, {
      error: failures.size === 0 ? state.error : undefined,
      failures,
      redirects: build.redirects,
      aliases: build.aliases,
      routes: build.routes,
      files: build.files,
    });

    if (target.type === 'error') {
      throw target.error;
    }

    if (target.type === 'redirect') {
      return Response.redirect(target.destination, 302);
    }

    if (target.type === 'alias') {
      const url = new URL(request.url);

      url.pathname = target.target;

      return Response.redirect(url.href, 308);
    }

    if (target.type === 'page') {
      return renderPage(build, target.url);
    }

    if (target.type === 'file') {
      return new Response(target.content, {
        headers: { 'Cache-Control': 'no-store' },
      });
    }
    return new Response('Not found', { status: 404 });
  }

  /**
   * 合并连续的文件变化，串行重建站点。
   *
   * @returns 当前重建完成后 resolve。
   */
  async function rebuild() {
    state.dirty = true;

    const running = (state.pending ??= (async () => {
      while (state.dirty && !state.closed) {
        state.dirty = false;

        try {
          const previous = state.build;
          const next = await createBuild(directory, {
            development: true,
            previous,
            onContentRange: updateContentRange,
          });

          state.build = next;
          state.error = undefined;
          failures.clear();
          watchTheme(next.themeRoot, next.project.root);

          /*
           * 每轮重建都按最新编译结果刷新桥接：配置变化、引用资源变化与源文件变化
           * 都在内容编译结果里体现，writeIfChanged 保证内容不变时不产生写入。
           */
          for (const source of contentSources) {
            if (!(await file(source).exists())) {
              contentSources.delete(source);

              await rm(contentBridgePath(next.project.workDir, source), {
                force: true,
              });
              continue;
            }

            try {
              await contentBridgeFile(source);
            } catch (error) {
              // 主动刷新失败时保留上次可用的桥接，错误由服务端构建与打包器在引用时报告。
              console.error(error);
            }
          }

          // 生成资源模块按各自的源文件刷新，缺失时保留登记，恢复后继续刷新。
          for (const source of assetSources) {
            try {
              await assetModuleFile(source);
            } catch (error) {
              // 资源暂缺或生成失败时保留登记并输出诊断，等待下次重建。
              console.error(error);
            }
          }
        } catch (error) {
          reportError(error);
        }
      }
    })().finally(() => {
      state.pending = undefined;
    }));

    return running;
  }

  try {
    state.build = await createBuild(directory, {
      development: true,
      onContentRange: updateContentRange,
    });
  } catch (error) {
    reportError(error);

    // 首次构建失败时没有主题信息，按配置定位主题源码继续监听修复。
    try {
      const project = await loadProject(directory);
      const theme = resolveSync(project.config.theme, project.root);

      watchTheme(findPackageRoot(dirname(theme)), project.root);

      // 恢复流程同样按已解析的目录排除生成文件与输出目录。
      contentRange = {
        root: project.content,
        directories: contentRange?.directories ?? new Set(),
        workDir: project.workDir,
        outdir: project.outdir,
      };
    } catch {
      // 配置或主题无法解析时没有可监听的源码。
    }
  }
  const entryDir = join(root, '.phyllo', 'dev');

  if (!state.build) {
    await writeIfChanged(join(entryDir, 'client.ts'), CLIENT_STUB);
  }
  await writeIfChanged(join(entryDir, 'index.html'), ENTRY_SOURCE);

  const entry = (await import(join(entryDir, 'index.html')))
    .default as HTMLBundle;
  /*
   * HTML 入口必须在服务器创建时注册：通过 server.reload 添加或替换的
   * HTMLBundle 路由不会启用开发模式（缺少 HMR 脚本）。
   * https://github.com/oven-sh/bun/issues/23564
   * https://github.com/oven-sh/bun/issues/25115
   * 页面响应由 handleRequest 服务端渲染，注册成 HTML 路由只会得到静态外壳。
   */
  const server = serve({
    hostname: options.hostname ?? 'localhost',
    port: options.port ?? 3000,
    development: { hmr: true },
    routes: { '/_phyllo/client': entry },
    fetch: handleRequest,
  });

  watchRoot(root);

  if (state.build) {
    watchTheme(state.build.themeRoot, state.build.project.root);
  }
  process.send?.(server.url.href);

  /**
   * 停止文件监听并关闭服务器。
   */
  const stop = async () => {
    if (state.closed) {
      return;
    }
    state.closed = true;

    for (const watcher of watchers) {
      watcher.close();
    }
    await state.pending;
    await server.stop(true);
    process.exit(0);
  };

  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  process.once('disconnect', stop);
}

if (import.meta.main) {
  const [, , directory, rawOptions] = argv;

  await startServer(directory!, JSON.parse(rawOptions!));
}
