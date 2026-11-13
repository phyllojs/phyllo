import { expect, test } from 'bun:test';

import { parseDocSearchRecord } from '../src/hooks/algolia-record';

test('接受 DocSearch 字段缺省值并保留额外字段', () => {
  const record = {
    url: '/example',
    hierarchy: { lvl0: 'Guide', lvl1: 'Hello', lvl2: null },
    content: null,
    extra: { example: true },
  };

  expect(parseDocSearchRecord(record)).toBe(record);

  expect(
    parseDocSearchRecord({ url: 'https://example.com', hierarchy: {} }),
  ).toMatchObject({
    hierarchy: {},
  });
});

test.each([
  null,
  'example',
  { url: 1, hierarchy: {} },
  { url: '//example.com', hierarchy: {} },
  { url: '/example', hierarchy: [] },
  { url: '/example', hierarchy: { lvl1: {} } },
  { url: '/example', hierarchy: { lvl6: 1 } },
  { url: '/example', hierarchy: {}, content: {} },
])('无效 DocSearch 字段在渲染前报错（%j）', record => {
  expect(() => parseDocSearchRecord(record)).toThrow(
    'Algolia record url, hierarchy, or content does not match the DocSearch schema.',
  );
});
