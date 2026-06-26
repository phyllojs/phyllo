import { expect, test } from 'bun:test';

import { resolveConfig, resolveHead } from '../src/config';

test('head 声明保留 React 属性名', () => {
  expect(resolveHead(undefined)).toEqual([]);

  expect(
    resolveHead({
      meta: [{ httpEquiv: 'refresh', content: '0' }, { charSet: 'utf-8' }],
      link: [{ rel: 'stylesheet', href: '/a.css', className: 'theme' }],
      script: [{ src: '/a.js', noModule: true }],
      style: [{ textContent: 'a {}' }],
    }),
  ).toEqual([
    { tag: 'meta', attrs: { httpEquiv: 'refresh', content: '0' } },
    { tag: 'meta', attrs: { charSet: 'utf-8' } },
    {
      tag: 'link',
      attrs: { rel: 'stylesheet', href: '/a.css', className: 'theme' },
    },
    { tag: 'script', attrs: { src: '/a.js', noModule: true } },
    { tag: 'style', attrs: {}, textContent: 'a {}' },
  ]);
});

test('head 运行时约束', () => {
  expect(() => resolveHead({ script: [{ textContent: '</script>' }] })).toThrow(
    'head.script content cannot contain a closing script tag.',
  );

  expect(() => resolveHead({ style: [{ textContent: '</style >' }] })).toThrow(
    'head.style content cannot contain a closing style tag.',
  );

  expect(() => resolveHead({ unknown: [] } as never)).toThrow(
    'Unknown head tag: unknown.',
  );

  expect(() => resolveHead({ meta: 'utf-8' } as never)).toThrow(
    'head.meta must be an array.',
  );

  expect(() => resolveHead({ meta: [null] } as never)).toThrow(
    'head.meta entries must be objects.',
  );

  expect(() => resolveHead({ link: [{ href: {} }] } as never)).toThrow(
    'Head attribute href must be a string, number or boolean.',
  );

  expect(() => resolveHead({ link: [{}] } as never)).toThrow(
    'head.link entries must include a string href.',
  );

  for (const href of [123, true, false]) {
    expect(() => resolveHead({ link: [{ href }] } as never)).toThrow(
      'head.link entries must include a string href.',
    );
  }

  expect(() => resolveHead({ style: [{}] } as never)).toThrow(
    'head.style entries must include a string textContent.',
  );

  expect(() => resolveHead({ noscript: [{}] } as never)).toThrow(
    'head.noscript entries must include a string innerHTML.',
  );

  // 已提供的空字符串按现有约定保留。
  expect(resolveHead({ link: [{ href: '' }] })).toEqual([
    {
      tag: 'link',
      attrs: { href: '' },
      textContent: undefined,
      innerHTML: undefined,
    },
  ]);
});

test('配置缺省值', () => {
  expect(resolveConfig({ theme: 'phyllo-theme-test' })).toEqual({
    theme: 'phyllo-theme-test',
    head: {},
    redirects: {},
    search: false,
    content: 'content',
    outdir: 'dist',
    markdown: { highlight: true, remarkPlugins: [], rehypePlugins: [] },
  });

  const resolved = resolveConfig({
    theme: 'phyllo-theme-test',
    title: 'Site',
    lang: 'zh-CN',
    search: true,
    content: 'docs',
    outdir: 'public',
    head: { meta: [{ name: 'theme-color', content: '#fff' }] },
    markdown: { highlight: false },
  });

  expect(resolved).toMatchObject({
    title: 'Site',
    lang: 'zh-CN',
    search: true,
    content: 'docs',
    outdir: 'public',
    head: { meta: [{ name: 'theme-color', content: '#fff' }] },
  });
  expect(resolved.markdown.highlight).toBe(false);
});

test('类型以外的配置约束', () => {
  expect(() =>
    resolveConfig({ theme: 'phyllo-theme-test', lang: 'not a tag' }),
  ).toThrow('Invalid language tag: not a tag.');

  expect(() =>
    resolveConfig({ theme: 'phyllo-theme-test', lang: ['en'] } as never),
  ).toThrow('lang must be a string.');

  expect(() => resolveConfig({ theme: '' })).toThrow(
    'theme must be a package name.',
  );

  expect(() => resolveConfig({ theme: './local-theme' })).toThrow(
    'theme must be a package name.',
  );

  expect(() =>
    resolveConfig({ theme: 'phyllo-theme-test', head: null } as never),
  ).toThrow('head must be an object.');

  expect(() =>
    resolveConfig({ theme: 'phyllo-theme-test', title: 1 } as never),
  ).toThrow('title must be a string.');

  expect(() =>
    resolveConfig({ theme: 'phyllo-theme-test', description: {} } as never),
  ).toThrow('description must be a string.');

  expect(() =>
    resolveConfig({ theme: 'phyllo-theme-test', redirects: null } as never),
  ).toThrow('redirects must be an object.');

  expect(() =>
    resolveConfig({
      theme: 'phyllo-theme-test',
      redirects: { '/a': null },
    } as never),
  ).toThrow('redirects["/a"] must be a string.');

  expect(() =>
    resolveConfig({ theme: 'phyllo-theme-test', search: null } as never),
  ).toThrow('search must be a boolean.');

  expect(() =>
    resolveConfig({ theme: 'phyllo-theme-test', content: null } as never),
  ).toThrow('content must be a string.');

  expect(() =>
    resolveConfig({ theme: 'phyllo-theme-test', outdir: null } as never),
  ).toThrow('outdir must be a string.');

  expect(() =>
    resolveConfig({ theme: 'phyllo-theme-test', markdown: null } as never),
  ).toThrow('markdown must be an object.');

  expect(() =>
    resolveConfig({
      theme: 'phyllo-theme-test',
      markdown: { highlight: null },
    } as never),
  ).toThrow('markdown.highlight must be a boolean.');

  expect(() =>
    resolveConfig({
      theme: 'phyllo-theme-test',
      markdown: { remarkPlugins: null },
    } as never),
  ).toThrow('markdown.remarkPlugins must be an array.');

  expect(() => resolveConfig({ theme: null } as never)).toThrow(
    'theme must be a package name.',
  );
});
