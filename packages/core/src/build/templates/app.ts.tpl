import type { ContentPage, PageData, SiteData } from 'phyllo';
import { createApp } from 'phyllo/render';
import { initializeSite } from 'phyllo/site';
import Layout from __THEME__;

const site: SiteData = __SITE__;
const pages: ContentPage[] = __PAGES__;
const home: PageData | undefined = __HOME__;

initializeSite(site, pages);

/** 头部配置版本，开发模式用它判断是否需要整页刷新。 */
export const configVersion = __CONFIG_VERSION__;

export const app = createApp({ Layout, pages, home });
