import { expect, test } from 'bun:test';

import { useSearch } from '../src/search/query';
import { initializeSite } from '../src/site-data';

test('useSearch 返回同一个查询函数', () => {
  expect(useSearch()).toBe(useSearch());
});

test('禁用与空查询返回空数组，不加载引擎', async () => {
  initializeSite({ search: false }, []);

  const search = useSearch();

  expect(await search('MDX')).toEqual([]);
  expect(await search('MDX', { limit: 5 })).toEqual([]);

  initializeSite({ search: true }, []);

  expect(await search('   ')).toEqual([]);
});

test('参数校验先于禁用与空查询判断', async () => {
  initializeSite({ search: false }, []);

  const search = useSearch();

  await expect(search('MDX', { limit: 0 })).rejects.toThrow(
    'Search limit must be a positive integer.',
  );

  await expect(search('   ', { limit: 1.5 })).rejects.toThrow(
    'Search limit must be a positive integer.',
  );
});
