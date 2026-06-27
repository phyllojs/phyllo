import { expect, test } from 'bun:test';

import { resolveRequest } from '../src/dev/server';

const broken = new Error('broken');
const state = {
  failures: new Map<string, unknown>([['/broken', broken]]),
  redirects: new Map<string, string>([['/old', '/new']]),
  aliases: new Map<string, string>([
    ['/page/', '/page'],
    ['/page.html', '/page'],
  ]),
  routes: new Map<string, string>([
    ['/page', 'page.html'],
    ['/broken', 'broken.html'],
    ['/old', 'old.html'],
  ]),
  files: new Map<string, Blob | string>([
    ['logo.svg', new Blob(['svg'])],
    ['note.txt', 'plain text'],
  ]),
};

test('失败页面优先', () => {
  const target = resolveRequest('/broken', state);

  expect(target.type).toBe('error');

  if (target.type === 'error') {
    expect(target.error).toBe(broken);
  }
  expect(resolveRequest('/broken/', state)).toEqual({ type: 'missing' });
});

test('重定向与别名优先', () => {
  expect(resolveRequest('/old', state)).toEqual({
    type: 'redirect',
    destination: '/new',
  });

  expect(resolveRequest('/page/', state)).toEqual({
    type: 'alias',
    target: '/page',
  });

  expect(resolveRequest('/page.html', state)).toEqual({
    type: 'alias',
    target: '/page',
  });
});

test('编码地址与输出文件', () => {
  const encoded = {
    failures: new Map<string, unknown>([['/%E5%9D%8F', broken]]),
    redirects: new Map<string, string>([['/%E5%86%85%E5%AE%B9', '/new']]),
    aliases: new Map<string, string>([
      ['/a%20b/', '/a%20b'],
      ['/a%20b.html', '/a%20b'],
    ]),
    routes: new Map<string, string>([
      ['/a%20b', 'a b.html'],
      ['/%E5%9D%8F', '坏.html'],
    ]),
    files: new Map<string, Blob | string>([['图片.png', new Blob(['img'])]]),
  };

  expect(resolveRequest('/a%20b', encoded)).toEqual({
    type: 'page',
    url: '/a%20b',
  });

  expect(resolveRequest('/a%20b/', encoded)).toEqual({
    type: 'alias',
    target: '/a%20b',
  });

  expect(resolveRequest('/a%20b.html', encoded)).toEqual({
    type: 'alias',
    target: '/a%20b',
  });
  expect(resolveRequest('/%E5%9D%8F', encoded).type).toBe('error');

  expect(resolveRequest('/%E5%86%85%E5%AE%B9', encoded)).toEqual({
    type: 'redirect',
    destination: '/new',
  });

  const file = resolveRequest('/%E5%9B%BE%E7%89%87.png', encoded);

  expect(file.type).toBe('file');
  expect(resolveRequest('/%zz', encoded)).toEqual({ type: 'missing' });
  expect(resolveRequest('/a b', encoded)).toEqual({ type: 'missing' });
});

test('页面与静态文件', async () => {
  expect(resolveRequest('/page', state)).toEqual({
    type: 'page',
    url: '/page',
  });

  const file = resolveRequest('/logo.svg', state);

  expect(file.type).toBe('file');

  if (file.type === 'file') {
    expect(await file.content.text()).toBe('svg');
  }
  expect(resolveRequest('/note.txt', state)).toEqual({ type: 'missing' });
  expect(resolveRequest('/nope', state)).toEqual({ type: 'missing' });
});

test('全局错误优先', () => {
  const global = { ...state, error: broken };

  expect(resolveRequest('/page', global)).toEqual({
    type: 'error',
    error: broken,
  });

  expect(resolveRequest('/logo.svg', global)).toEqual({
    type: 'error',
    error: broken,
  });

  expect(resolveRequest('/nope', global)).toEqual({
    type: 'error',
    error: broken,
  });
});
