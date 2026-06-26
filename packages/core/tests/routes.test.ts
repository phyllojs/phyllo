import { expect, test } from 'bun:test';

import { resolveRoutes } from '../src/routing/routes';

test('路由表生成', () => {
  const { routes } = resolveRoutes(['/guide', '/guide/setup'], []);

  expect([...routes]).toEqual([
    ['/', 'index.html'],
    ['/guide', 'guide.html'],
    ['/guide/setup', 'guide/setup.html'],
  ]);
});

test('编码文件名', () => {
  const url = `/${encodeURIComponent('中文')}`;
  const { routes } = resolveRoutes([url], []);

  expect(routes.get(url)).toBe('中文.html');
});

test('重定向路由', () => {
  const { routes } = resolveRoutes([], ['/old']);

  expect(routes.get('/old')).toBe('old.html');
});

test('别名生成', () => {
  const { aliases } = resolveRoutes(['/guide'], []);

  expect(aliases.get('/guide/')).toBe('/guide');
  expect(aliases.get('/guide.html')).toBe('/guide');
  expect(aliases.has('//')).toBe(false);
});

test('输出冲突报错', () => {
  expect(() => resolveRoutes(['/a/b'], ['/a%2Fb'])).toThrow(
    'Routes /a/b and /a%2Fb both generate a/b.html. Rename one of the content pages or redirects.',
  );
});
