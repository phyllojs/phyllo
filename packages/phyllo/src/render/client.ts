import type { ComponentType } from 'react';
import { type Root, hydrateRoot } from 'react-dom/client';

import type { SiteApp } from './app';
import { hydrateContainer, readResources } from './shared';

/**
 * 页面内容模块。
 */
type ContentModule = { default: ComponentType };

/**
 * 页面地址到内容模块加载函数的映射。
 */
type ContentLoaders = Record<
  string,
  () => ContentModule | Promise<ContentModule>
>;

/**
 * 热更新状态，用于跨模块更新复用首次接管的根。
 */
interface HotState {
  root?: Root;
  /** 首次接管时的头部配置版本。 */
  configVersion?: string;
}

/**
 * 启动客户端：加载当前页面的内容模块并接管服务端输出。
 *
 * @param app - 站点应用。
 * @param loaders - 页面地址到内容模块加载函数的映射。
 * @param state - 热更新状态，首次启动时省略。
 * @param configVersion - 头部配置版本，变化时整页刷新。
 */
export async function startClient(
  app: SiteApp,
  loaders: ContentLoaders,
  state?: HotState,
  configVersion?: string,
) {
  // 头部配置变化后热更新沿用的旧资源无法同步，等待整页刷新。
  if (state && configVersion !== undefined) {
    if (state.configVersion === undefined) {
      state.configVersion = configVersion;
    } else if (state.configVersion !== configVersion) {
      location.reload();

      return;
    }
  }
  const { render: renderApp, getPage, runWithPage } = app;
  const initial = readResources();
  const url = initial.url;
  const page = getPage(url);

  if (!page) {
    if (state) {
      location.reload();

      return;
    }
    throw new Error(`Cannot hydrate unknown page: ${url}`);
  }

  const Content = (await loaders[url]?.())?.default;

  // 浏览器为单页文档，绑定在接管或更新前完成并保持可读。
  runWithPage(page, () => {
    // 热更新沿用首次接管时的资源。
    const tree = renderApp({ Content, resources: initial });

    if (state?.root) {
      state.root.render(tree);

      return;
    }
    const root = hydrateRoot(hydrateContainer(initial.elements), tree);

    if (state) {
      state.root = root;
    }
  });
}
