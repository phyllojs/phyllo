import { type SearchOptions, type SearchResult, useSearch } from 'phyllo';
import { useCallback, useEffect, useMemo, useState } from 'react';

/**
 * 查询本地搜索索引并管理界面状态。
 *
 * phyllo 提供无状态的异步查询函数，加载状态、重试与旧结果失效由主题维护。
 *
 * @param query - 查询文本，空字符串不搜索。
 * @param options - 搜索选项。
 * @returns 搜索结果、加载状态、错误与重试方法。
 */
export function useLocalSearch(query: string, options: SearchOptions = {}) {
  const search = useSearch();
  const { directory, limit } = options;
  const text = query.trim();
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt(value => value + 1), []);

  // 开发更新后索引缓存已清除，重新执行当前查询以刷新已展示的结果。
  useEffect(() => {
    if (!import.meta.hot) {
      return;
    }
    const update = retry;

    import.meta.hot.on('bun:afterUpdate', update);

    return () => {
      import.meta.hot?.off('bun:afterUpdate', update);
    };
  }, [retry]);

  const request = useMemo(
    () => ({ text, directory, limit, attempt }),
    [text, directory, limit, attempt],
  );
  const [state, setState] = useState<{
    request: typeof request;
    results: SearchResult[];
    error?: Error;
  }>();

  useEffect(() => {
    const { text, directory, limit } = request;

    if (!text) {
      return;
    }
    // 查询被新的请求取代后不再写入结果。
    const status = { cancelled: false };

    (async () => {
      try {
        const results = await search(text, { directory, limit });

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
    })();

    return () => {
      status.cancelled = true;
    };
  }, [search, request]);

  // 搜索条件变化时立即隐藏旧结果，不必等 useEffect 执行清理函数。
  const current = text && state?.request === request ? state : undefined;

  return {
    results: current?.results ?? [],
    isLoading: !!text && !current,
    error: current?.error,
    retry,
  };
}
