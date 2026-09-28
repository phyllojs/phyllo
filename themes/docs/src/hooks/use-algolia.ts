import type { SearchResult } from 'phyllo';
import { useCallback, useEffect, useMemo, useState } from 'react';

/**
 * Algolia 搜索配置。
 */
export interface AlgoliaOptions {
  appId: string;
  apiKey: string;
  indexName: string;
}

/**
 * Algolia 搜索选项。
 */
export interface AlgoliaSearchOptions {
  lang?: string;
  /** 搜索结果数量上限，默认为 20。 */
  limit?: number;
}

/** Algolia DocSearch 爬虫生成的记录。 */
interface DocSearchRecord {
  url: string;
  hierarchy: Record<string, string | null>;
  content?: string | null;
}

interface LiteClient {
  search<T>(options: {
    requests: {
      indexName: string;
      query: string;
      hitsPerPage: number;
      facetFilters?: string[];
      attributesToRetrieve: string[];
      attributesToHighlight: string[];
    }[];
  }): Promise<{ results: ({ hits: T[] } | Record<string, never>)[] }>;
}

interface AlgoliaModule {
  liteClient(appId: string, apiKey: string): LiteClient;
}

/*
 * 下面两个工具与 phyllo 内部的同名实现一致。主题是独立发布包，拿不到核心内部模块，
 * 这里保留一份自己的实现，改动时两处需要同步。
 */
const SEGMENTER = new Intl.Segmenter('und', { granularity: 'word' });

function tokenize(text: string): string[] {
  return [...SEGMENTER.segment(text)]
    .filter(part => part.isWordLike)
    .map(part => part.segment);
}

function snippet(text: string, terms: string[]): string {
  const lower = text.toLowerCase();
  const positions = terms
    .map(term => lower.indexOf(term.toLowerCase()))
    .filter(position => position >= 0);
  const start = Math.max(
    0,
    (positions.length ? Math.min(...positions) : 0) - 48,
  );
  const excerpt = text.slice(start, start + 180);

  return `${start ? '…' : ''}${excerpt}${start + 180 < text.length ? '…' : ''}`;
}

/** 按 appId 与 apiKey 缓存的 Algolia 客户端。 */
const clients = new Map<string, LiteClient>();

async function loadClient(appId: string, apiKey: string): Promise<LiteClient> {
  const key = JSON.stringify([appId, apiKey]);
  const existing = clients.get(key);

  if (existing) {
    return existing;
  }

  try {
    // 保留可选依赖的异步加载，字符串断言避免类型检查要求站点预先安装 SDK。
    const sdk = (await import('algoliasearch/lite' as string)) as AlgoliaModule;
    const client = sdk.liteClient(appId, apiKey);

    clients.set(key, client);

    return client;
  } catch {
    throw new Error(
      'Install algoliasearch to use Algolia search in phyllo-theme-docs.',
    );
  }
}

async function searchAlgolia(
  query: string,
  config: AlgoliaOptions,
  limit: number,
  lang?: string,
): Promise<SearchResult[]> {
  const client = await loadClient(config.appId, config.apiKey);
  const response = await client.search<DocSearchRecord>({
    requests: [
      {
        indexName: config.indexName,
        query,
        hitsPerPage: limit,
        facetFilters: lang ? [`lang:${lang}`] : undefined,
        attributesToRetrieve: ['url', 'hierarchy', 'content'],
        attributesToHighlight: [],
      },
    ],
  });
  const terms = tokenize(query);
  const results = new Map<string, SearchResult>();

  for (const group of response.results) {
    if (!('hits' in group)) {
      continue;
    }

    for (const hit of group.hits) {
      if (
        !hit.url ||
        !hit.hierarchy ||
        !/^(https?:\/\/|\/(?!\/))/.test(hit.url)
      ) {
        throw new Error(
          'Algolia records must use the DocSearch schema with url and hierarchy.',
        );
      }
      const levels = Array.from(
        { length: 7 },
        (_, level) => hit.hierarchy[`lvl${level}`],
      ).filter(
        (value): value is string => typeof value === 'string' && !!value,
      );
      const title = hit.hierarchy.lvl1 || hit.hierarchy.lvl0 || '';
      const [lastLevel] = levels.toReversed();
      const heading = lastLevel ?? '';

      if (!results.has(hit.url)) {
        results.set(hit.url, {
          url: hit.url,
          title,
          heading: heading === title ? '' : heading,
          snippet: snippet(hit.content ?? '', terms),
          terms,
        });
      }
    }
  }
  return [...results.values()].slice(0, limit);
}

/**
 * 查询 Algolia 索引。
 *
 * @remarks
 * 远程 SDK 在首次查询时按需加载；查询变化时立即隐藏旧结果，避免闪回。
 *
 * @param query - 查询文本，空字符串不搜索。
 * @param config - Algolia 配置，省略时不搜索。
 * @param options - 语言与结果数量上限。
 * @returns 搜索结果、加载状态、错误与重试方法。
 * @throws 结果数量上限不是正整数时抛出错误。
 */
export function useAlgolia(
  query: string,
  config: AlgoliaOptions | undefined,
  { limit = 20, lang }: AlgoliaSearchOptions = {},
) {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error('Search limit must be a positive integer.');
  }
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  const text = query.trim();
  const request = useMemo(
    () => ({ config, query: text, limit, lang, attempt }),
    [config, text, limit, lang, attempt],
  );
  const [state, setState] = useState<{
    request: typeof request;
    results: SearchResult[];
    error?: Error;
  }>();
  const active = !!config && !!text;

  useEffect(() => {
    if (!active || !config) {
      return;
    }
    // 查询被新的请求取代后不再写入结果。
    const status = { cancelled: false };

    const timer = setTimeout(async () => {
      try {
        const results = await searchAlgolia(text, config, limit, lang);

        if (!status.cancelled) {
          setState({ request, results });
        }
      } catch (cause) {
        if (!status.cancelled) {
          setState({
            request,
            results: [],
            error: cause instanceof Error ? cause : new Error(String(cause)),
          });
        }
      }
    }, 150);

    return () => {
      status.cancelled = true;
      clearTimeout(timer);
    };
  }, [request]);

  const current = active && state?.request === request ? state : undefined;

  return {
    results: current?.results ?? [],
    isLoading: active && !current,
    error: current?.error,
    retry,
  };
}
