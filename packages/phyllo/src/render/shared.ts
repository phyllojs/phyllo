import type { SiteApp } from './app';
import type { Resources } from './document';

/**
 * 由地址栏路径解析页面地址，去掉 index.html 与尾斜杠。
 *
 * @param app - 站点应用。
 * @param pathname - 地址栏路径。
 * @returns 页面地址。
 */
export function resolveClientUrl(app: SiteApp, pathname: string) {
  return app.getPage(pathname)?.url === pathname
    ? pathname
    : pathname
        .replace(/^\/index\.html$/, '/')
        .replace(/\.html$/, '')
        .replace(/\/$/, '') || '/';
}

/**
 * 读取服务端输出的资源描述。
 *
 * @returns 当前页面的资源。
 */
export function readResources(): Resources {
  return JSON.parse(
    document.getElementById('phyllo-resources')!.textContent!,
  ) as Resources;
}

/**
 * 按主题输出的文档元素选择接管容器。
 *
 * @param elements - 主题输出的文档元素。
 * @returns 接管使用的容器。
 */
export function hydrateContainer(
  elements: NonNullable<Resources['elements']>,
): Element | Document {
  return elements.includes('html')
    ? document
    : elements.length
      ? document.documentElement
      : document.body;
}
