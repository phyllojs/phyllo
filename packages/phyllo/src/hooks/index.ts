import { getCurrentPage } from 'phyllo/page';

import { type ContentPage, type Frontmatter } from '../data';
import type { ContentPageUrl } from '../index';
import { getSiteData } from '../site-data';

/**
 * 读取站点级信息。
 *
 * @returns 站点级信息。
 */
export function useSite() {
  return getSiteData().site;
}

/**
 * 读取当前页面。
 *
 * @returns 当前页面。
 */
export function usePage() {
  return getCurrentPage();
}

/**
 * 读取当前页面的 frontmatter。
 *
 * @typeParam T - frontmatter 的类型。
 * @returns 当前页面的 frontmatter。
 */
export function useFrontmatter<T extends Frontmatter = Frontmatter>(): T {
  return usePage().frontmatter as T;
}

/**
 * 读取全部内容页面，不加载正文。
 *
 * @returns 内容页面列表。
 */
export function usePages(): readonly ContentPage<ContentPageUrl>[] {
  return getSiteData().pages as readonly ContentPage<ContentPageUrl>[];
}
