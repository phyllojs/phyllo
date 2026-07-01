import type { ContentPage, SiteData } from './data';

/**
 * 站点数据存储：站点级信息与全部内容页面。
 *
 * 由生成的入口在渲染前初始化，与生成数据同源，不重新解析配置、不复制页面列表。
 */
let siteData:
  | {
      site: SiteData;
      pages: readonly ContentPage[];
    }
  | undefined;

/**
 * 初始化站点数据，由生成的入口调用，主题不调用。
 *
 * @param site - 站点级信息。
 * @param pages - 全部内容页面。
 */
export function initializeSite(site: SiteData, pages: readonly ContentPage[]) {
  siteData = { site, pages };
}

/**
 * 读取站点数据。
 *
 * @returns 站点级信息与全部内容页面。
 * @throws 尚未初始化时抛出错误。
 */
export function getSiteData() {
  if (siteData === undefined) {
    throw new Error('Phyllo site data has not been initialized.');
  }
  return siteData;
}
