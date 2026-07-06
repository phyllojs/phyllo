import { runWithPage } from 'phyllo/page';
import type { ComponentType, ReactNode } from 'react';
import { type Root, hydrateRoot } from 'react-dom/client';

import type { SiteApp } from './app';
import type { Resources } from './document';
import { hydrateContainer, readResources, resolveClientUrl } from './shared';

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
 * 在浏览器解析出的元素上接管应用。
 *
 * @param tree - 应用节点树。
 * @param elements - 主题输出的文档元素。
 * @returns 接管使用的 React 根。
 */
function hydrateDocument(
  tree: ReactNode,
  elements: NonNullable<Resources['elements']>,
) {
  return hydrateRoot(hydrateContainer(elements), tree);
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
  const { App, getPage } = app;
  const url = resolveClientUrl(app, location.pathname);
  const page = getPage(url);
  const Content = (await loaders[url]?.())?.default;
  const initial: Resources = readResources();

  if (!page) {
    location.reload();

    return;
  }
  // 浏览器为单页文档，绑定在接管或更新前完成并保持可读。
  runWithPage(page, () => {
    // 热更新沿用首次接管时的资源。
    const tree = App({ Content, resources: initial });

    if (!state) {
      hydrateDocument(tree, initial.elements!);

      return;
    }

    if (state.root) {
      state.root.render(tree);
    } else {
      state.root = hydrateDocument(tree, initial.elements!);
    }
  });
}
