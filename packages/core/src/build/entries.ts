import { file } from 'bun';
import { join } from 'node:path';

import type { ContentPage, PageData, SiteData } from 'phyllo';

/**
 * 生成入口模块的输入。
 */
export interface EntrySourcesOptions {
  /** 主题包说明符，由打包器按构建目标解析入口。 */
  theme: string;
  /** 站点级信息。 */
  site: SiteData;
  /** 全部内容页面。 */
  pages: ContentPage[];
  /** 没有首页源文件时的虚拟首页。 */
  home?: PageData;
  /** 内容目录的绝对路径。 */
  content: string;
  /** 头部配置版本，开发模式用它判断是否需要整页刷新。 */
  configVersion: string;
  /** 是否生成开发模式入口。 */
  development: boolean;
}

/**
 * 三个入口模块的源码。
 */
export interface EntrySources {
  /** app.ts 源码。 */
  app: string;
  /** client.ts 源码。 */
  client: string;
  /** server.ts 源码。 */
  server: string;
}

/** 入口模板目录。 */
const TEMPLATE_DIR = new URL('./templates/', import.meta.url);

/**
 * 读取入口模板。
 *
 * @param name - 入口名称。
 * @returns 模板内容。
 */
function readTemplate(name: keyof EntrySources): Promise<string> {
  return file(new URL(`${name}.ts.tpl`, TEMPLATE_DIR)).text();
}

/**
 * 用值替换模板中的 `__NAME__` 占位符。
 *
 * @param source - 模板内容。
 * @param values - 占位符名称到代码片段的映射。
 * @returns 替换后的源码。
 * @throws 模板出现未提供值的占位符时抛出错误。
 */
function fill(source: string, values: Record<string, string>): string {
  return source.replace(/__([A-Z_]+)__/g, (_match, name: string) => {
    const value = values[name];

    if (value === undefined) {
      throw new Error(`Unknown template placeholder: ${name}`);
    }
    return value;
  });
}

/**
 * 生成 app、client、server 三个入口模块的源码。
 *
 * @param options - 生成入口模块的输入。
 * @returns 三个入口模块的源码。
 */
export async function createEntrySources(
  options: EntrySourcesOptions,
): Promise<EntrySources> {
  const { content, configVersion, development, home, pages, site, theme } =
    options;
  const quote = JSON.stringify;
  const runtimePath = join(import.meta.dir, '..', 'runtime.tsx');
  const pageImports = pages
    .map(
      (page, index) =>
        `import Page${index} from ${quote(join(content, page.filePath))};`,
    )
    .join('\n');
  const loaderEntries = pages
    .map((page, index) =>
      development
        ? `  ${quote(page.url)}: () => ({ default: Page${index} }),`
        : `  ${quote(page.url)}: () => import(${quote(join(content, page.filePath))}),`,
    )
    .join('\n');
  const componentEntries = pages
    .map((page, index) => `  ${quote(page.url)}: Page${index},`)
    .join('\n');
  const [app, client, server] = await Promise.all([
    readTemplate('app'),
    readTemplate('client'),
    readTemplate('server'),
  ]);

  return {
    app: fill(app, {
      THEME: quote(theme),
      SITE: JSON.stringify(site, null, 2),
      PAGES: JSON.stringify(pages, null, 2),
      HOME: home === undefined ? 'undefined' : JSON.stringify(home, null, 2),
      CONFIG_VERSION: quote(configVersion),
    }),
    client: fill(client, {
      BUILD_ID: development ? quote(String(Date.now())) : 'undefined',
      PAGE_IMPORTS: development ? `${pageImports}\n` : '',
      LOADERS: loaderEntries,
      START: development
        ? 'await startClient(app, loaders, import.meta.hot.data, configVersion);\nimport.meta.hot.accept();'
        : 'await startClient(app, loaders);',
    }),
    server: fill(server, {
      RUNTIME: quote(runtimePath),
      PAGE_IMPORTS: `${pageImports}\n`,
      COMPONENTS: componentEntries,
    }),
  };
}
