import { AsyncLocalStorage } from 'node:async_hooks';

import type { PageData } from './data';

/** 当前页面的请求作用域存储。 */
const pageStorage = new AsyncLocalStorage<PageData>();

/**
 * 在当前页面作用域内执行渲染。
 *
 * @param page - 当前渲染页面。
 * @param render - 在作用域内执行的渲染。
 * @returns 渲染的返回值，同步调用返回同步结果，异步调用返回原 Promise。
 */
export function runWithPage<T>(page: PageData, render: () => T): T {
  return pageStorage.run(page, render);
}

/**
 * 读取当前渲染页面。
 *
 * @returns 当前页面。
 * @throws 不在页面作用域内时抛出错误。
 */
export function getCurrentPage(): PageData {
  const page = pageStorage.getStore();

  if (page === undefined) {
    throw new Error('Phyllo current page has not been initialized.');
  }
  return page;
}
