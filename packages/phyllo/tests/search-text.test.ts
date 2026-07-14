import { expect, test } from 'bun:test';

import { snippet, tokenize } from '../src/search/text';

test('分词', () => {
  expect(tokenize('Hello, world!')).toEqual(['Hello', 'world']);
  expect(tokenize('v2 release')).toEqual(['v2', 'release']);
});

test('短文本摘要', () => {
  expect(snippet('The quick brown fox', ['brown'])).toBe('The quick brown fox');
});

test('长文本摘要', () => {
  const result = snippet(`${'a'.repeat(100)} target tail`, ['target']);

  expect(result.startsWith('…')).toBe(true);
  expect(result).toContain('target');
});

test('摘要忽略大小写', () => {
  expect(snippet('Hello WORLD', ['world'])).toBe('Hello WORLD');
});
