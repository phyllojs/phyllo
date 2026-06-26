import { expect, test } from 'bun:test';

import { resolveRedirects } from '../src/routing/redirects';

test('空配置', () => {
  expect(resolveRedirects(undefined, new Set()).size).toBe(0);
});

test('链路展开', () => {
  const result = resolveRedirects({ '/a': '/b', '/b': '/c' }, new Set(['/c']));

  expect([...result]).toEqual([
    ['/a', '/c'],
    ['/b', '/c'],
  ]);
});

test('根路径目标', () => {
  const result = resolveRedirects({ '/old': '/' }, new Set());

  expect(result.get('/old')).toBe('/');
});

test('非法配置报错', () => {
  expect(() => resolveRedirects({ '/a/': '/b' }, new Set(['/b']))).toThrow(
    'Invalid redirect route: /a/. Use / or an encoded /directory URL without a trailing slash.',
  );

  expect(() =>
    resolveRedirects({ '/_phyllo/x': '/b' }, new Set(['/b'])),
  ).toThrow(
    'Invalid redirect route: /_phyllo/x. Use / or an encoded /directory URL without a trailing slash.',
  );

  expect(() =>
    resolveRedirects({ '/a': '/b', '/b': '/a' }, new Set(['/a', '/b'])),
  ).toThrow('Redirect cycle starting at /a.');

  expect(() => resolveRedirects({ '/a': '/missing' }, new Set())).toThrow(
    'Redirect destination does not exist: /missing',
  );
});
