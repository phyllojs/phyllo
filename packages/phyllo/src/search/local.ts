import MiniSearch from 'minisearch';

import { snippet, tokenize } from './text';
import {
  type SearchDocument,
  type SearchOptions,
  type SearchResult,
  searchIndexPath,
} from './types';

/** 搜索索引缓存。 */
const cache = {
  /** 索引文档，只加载一次。 */
  documents: undefined as Promise<SearchDocument[]> | undefined,
  /** 按内容目录缓存的索引。 */
  indexes: new Map<string, Promise<MiniSearch<SearchDocument>>>(),
};

if (import.meta.hot) {
  import.meta.hot.on('bun:beforeUpdate', () => {
    cache.documents = undefined;
    cache.indexes.clear();
  });
}

/**
 * 加载搜索索引文档，失败时不保留缓存。
 *
 * @returns 搜索索引文档。
 * @throws 索引请求失败时抛出错误。
 */
async function loadDocuments() {
  const pending = (cache.documents ??= (async () => {
    const response = await fetch(searchIndexPath, { cache: 'no-cache' });

    if (!response.ok) {
      throw new Error(`Could not load the search index (${response.status}).`);
    }
    return (await response.json()) as SearchDocument[];
  })());

  try {
    return await pending;
  } catch (error) {
    if (cache.documents === pending) {
      cache.documents = undefined;
    }
    throw error;
  }
}

/**
 * 创建指定内容目录的索引。
 *
 * @param key - 内容目录，空串表示全部内容。
 * @returns MiniSearch 索引。
 */
async function createIndex(key: string) {
  const documents = await loadDocuments();
  const index = new MiniSearch<SearchDocument>({
    idField: 'url',
    fields: ['title', 'heading', 'text'],
    storeFields: ['title', 'heading', 'text'],
    tokenize,
    searchOptions: {
      boost: { heading: 6, title: 4 },
      prefix: true,
      fuzzy: term => (term.length >= 4 ? 0.2 : false),
      combineWith: 'AND',
    },
  });

  await index.addAllAsync(
    key
      ? documents.filter(
          document =>
            document.directory === key ||
            document.directory.startsWith(`${key}/`),
        )
      : documents,
  );

  return index;
}

/**
 * 加载指定内容目录的索引，失败时不保留缓存。
 *
 * @param directory - 内容目录，省略时索引全部内容。
 * @returns MiniSearch 索引。
 */
async function loadIndex(directory?: string) {
  const key = directory ?? '';
  const pending = cache.indexes.get(key) ?? createIndex(key);

  cache.indexes.set(key, pending);

  try {
    return await pending;
  } catch (error) {
    if (cache.indexes.get(key) === pending) {
      cache.indexes.delete(key);
    }
    throw error;
  }
}

/**
 * 查询本地索引，limit 由 useSearch() 补齐。
 *
 * @param query - 查询文本。
 * @param options - 内容目录与结果数量上限。
 * @returns 搜索结果。
 */
export async function search(
  query: string,
  { directory, limit }: SearchOptions & { limit: number },
): Promise<SearchResult[]> {
  const index = await loadIndex(directory);

  return index
    .search(query)
    .slice(0, limit)
    .map(result => ({
      url: result.id,
      title: result.title,
      heading: result.heading,
      snippet: snippet(result.text, result.terms),
      terms: result.terms,
    }));
}
