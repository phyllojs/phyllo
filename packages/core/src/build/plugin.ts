import { type BunPlugin, resolveSync } from 'bun';

import type { Project } from '../config/project';
import { logicalContentFile } from '../content';
import { type createCompiler, loadContent } from '../content/compile';

import { ASSET_MODULE, ASSET_NAMESPACE, assetModule } from './assets';

/**
 * 把运行时依赖解析到站点自己的副本，缺少时退回 core 的依赖。
 *
 * @param specifier - 导入路径。
 * @param root - 站点根目录。
 * @returns 解析后的模块路径。
 */
function resolvePackage(specifier: string, root: string): string {
  try {
    return resolveSync(specifier, root);
  } catch {
    return resolveSync(specifier, import.meta.dir);
  }
}

/**
 * 内容构建插件选项。
 */
export interface ContentPluginOptions {
  /** 解析后的站点工程信息。 */
  project: Project;
  /** 内容编译器。 */
  compile: ReturnType<typeof createCompiler>;
  /** 收集构建产物的映射。 */
  files: Map<string, Blob | string>;
  /** 真实目录到内容逻辑目录的映射，省略时内容模块按真实路径编译。 */
  directories?: ReadonlyMap<string, string>;
  /** 服务端打包时把样式表替换为空模块。 */
  server?: boolean;
}

/**
 * 创建 Bun 构建插件：解析运行时依赖，并用内容编译结果加载 MDX。
 *
 * @param options - 插件选项。
 * @returns Bun 构建插件。
 */
export function contentPlugin(options: ContentPluginOptions): BunPlugin {
  const {
    project,
    compile,
    files,
    directories = new Map<string, string>(),
    server = false,
  } = options;

  return {
    name: 'phyllo',
    setup(build) {
      /*
       * 优先使用站点安装的 Phyllo 和 React，确保主题、MDX 与生成入口使用同一份模块实例。
       * 只拦截没有构建目标条件差异的入口：react 与 jsx 运行时、react-dom 与接管入口；
       * react-dom/server 仅在服务端打包中固定 SSR 入口，其余 react-dom 子路径
       *（如 react-dom/static）由 Bun 按构建目标原生解析。
       */
      build.onResolve(
        {
          filter:
            /^(?:phyllo|phyllo\/(?:client|render|site|types)|react(?:\/(?:jsx-runtime|jsx-dev-runtime))?|react-dom(?:\/(?:client|server))?)$/,
        },
        args => {
          if (!server && args.path === 'react-dom/server') {
            return;
          }
          return { path: resolvePackage(args.path, project.root) };
        },
      );

      // 内容模块按真实位置解析；加载时按真实目录映射还原逻辑路径编译。
      build.onLoad({ filter: /\.mdx?$/ }, async ({ path }) => ({
        contents: (
          await loadContent(
            logicalContentFile(path, directories),
            compile,
            files,
          )
        ).code,
        loader: 'jsx',
      }));

      // 主题从 JS 导入的图片统一走内容哈希地址，CSS 的 url() 保持 Bun 的处理。
      build.onResolve({ filter: ASSET_MODULE }, args => {
        if (
          args.kind !== 'import-statement' &&
          args.kind !== 'dynamic-import' &&
          args.kind !== 'require-call'
        ) {
          return;
        }
        // 包装模块使用独立虚拟路径，避免与 CSS 引用的同一文件共用模块身份。
        return {
          path: `${resolveSync(args.path, args.resolveDir)}?phyllo-asset`,
          namespace: ASSET_NAMESPACE,
        };
      });

      build.onLoad(
        { filter: /.*/, namespace: ASSET_NAMESPACE },
        async ({ path }) => ({
          contents: await assetModule(project, path.split('?')[0]!, files),
          loader: 'js',
        }),
      );

      if (server) {
        build.onLoad({ filter: /\.css$/ }, () => ({
          contents: 'export default {};',
          loader: 'js',
        }));
      }
    },
  };
}
