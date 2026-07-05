import type { ComponentType, ReactNode } from 'react';

import { Context } from '../context';
import type { ContentPage, PageData } from '../data';

import type { Resources } from './document';

/**
 * 创建站点应用的输入。
 */
interface AppOptions {
  /** 主题布局组件。 */
  Layout: ComponentType<{ children?: ReactNode }>;
  /** 全部内容页面。 */
  pages: ContentPage[];
  /** 没有首页源文件时的虚拟首页。 */
  home?: PageData;
}

/**
 * 渲染页面所需的属性。
 */
interface AppProps {
  /** 当前页面的内容组件。 */
  Content?: ComponentType;
  /** 当前页面的头部资源。 */
  resources: Resources;
}

/**
 * 创建站点应用：按地址查找页面并渲染主题布局。
 *
 * @param options - 站点应用的输入。
 * @returns 页面查找函数与渲染组件。
 */
export function createApp(options: AppOptions) {
  const { Layout, pages, home } = options;

  return {
    getPage(url: string) {
      const match = pages.find(page => page.url === url);

      return match ?? (url === '/' ? home : undefined);
    },
    App({ Content, resources }: AppProps) {
      return (
        <Context value={{ resources }}>
          <Layout>{Content && <Content />}</Layout>
        </Context>
      );
    },
  };
}

/**
 * 站点应用的类型。
 */
export type SiteApp = ReturnType<typeof createApp>;
