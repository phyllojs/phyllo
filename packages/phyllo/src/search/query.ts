import { getSiteData } from '../site-data';

import type { SearchOptions, SearchResult } from './types';

/**
 * 查询本地搜索索引。
 *
 * 参数校验先于禁用与空查询判断；禁用或空查询不加载引擎、不请求索引。
 * 引擎按需动态加载，失败后的缓存清理由引擎模块负责。
 *
 * @param query - 查询文本。
 * @param options - 搜索选项。
 * @returns 搜索结果。
 * @throws 结果数量上限非法、站点数据未初始化或索引加载、查询失败时抛出错误。
 */
async function queryLocalIndex(
  query: string,
  options: SearchOptions = {},
): Promise<SearchResult[]> {
  const { directory, limit = 20 } = options;

  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error('Search limit must be a positive integer.');
  }
  const { site } = getSiteData();
  const text = query.trim();

  if (site.search !== true || text === '') {
    return [];
  }
  const engine = await import('./local');

  return engine.search(text, { directory, limit });
}

/**
 * 读取本地查询函数。
 *
 * @returns 稳定的查询函数，不建立订阅、不加载引擎。
 */
export function useSearch() {
  return queryLocalIndex;
}
