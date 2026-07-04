import type { PageData } from './data';

/** 当前文档的页面数据，每个文档对应一个页面。 */
let currentPage: PageData | undefined;

/**
 * 绑定当前文档的页面并执行接管或更新。
 *
 * @param page - 当前渲染页面。
 * @param render - 在绑定后执行的接管或更新。
 * @returns 渲染的返回值。
 */
export function runWithPage<T>(page: PageData, render: () => T): T {
  currentPage = page;

  return render();
}

/**
 * 读取当前文档的页面。
 *
 * @returns 当前页面。
 * @throws 尚未绑定时抛出错误。
 */
export function getCurrentPage(): PageData {
  if (currentPage === undefined) {
    throw new Error('Phyllo current page has not been initialized.');
  }
  return currentPage;
}
