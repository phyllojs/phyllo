import type { ContentPage, PageData, SiteData } from 'phyllo';
import { createApp } from 'phyllo/render';
import { initializeSite } from 'phyllo/site';
import Layout from __THEME__;

const { site, pages, home } = JSON.parse(__DATA__) as {
  site: SiteData;
  pages: ContentPage[];
  home?: PageData;
};

initializeSite(site, pages);

/** 头部配置版本，开发模式用它判断是否需要整页刷新。 */
export const configVersion = __CONFIG_VERSION__;

export const app = createApp({ Layout, pages, home });
