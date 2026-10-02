import { expect, test } from 'bun:test';

import type { ContentPage, PageData } from 'phyllo';

import { type DocsFrontmatter, resolveDocs } from '../src/hooks/docs-data';

/**
 * 构造内容页面。
 */
function contentPage(
  url: string,
  title: string,
  frontmatter: DocsFrontmatter = {},
): ContentPage {
  return {
    url,
    title,
    filePath: url === '/' ? 'index.mdx' : `${url.slice(1)}/index.mdx`,
    frontmatter,
    hasContent: true,
  };
}

/**
 * 构造当前页面。
 */
function currentPage(url: string, frontmatter: DocsFrontmatter = {}): PageData {
  return { url, title: url, frontmatter, hasContent: true };
}

test('默认布局与界面文案', () => {
  const data = resolveDocs({
    site: { title: 'Site' },
    page: currentPage('/'),
    pages: [contentPage('/', 'Home')],
  });

  expect(data.layout).toBe('home');
  expect(data.isHome).toBe(true);
  expect(data.text.home).toBe('Overview');
  expect(data.search).toBe(false);
  expect(data.searchDirectory).toBe('');
  expect(data.languages).toEqual([]);
  expect(data.breadcrumbs).toEqual([]);

  const article = resolveDocs({
    site: { title: 'Site', lang: 'zh-CN' },
    page: currentPage('/guide'),
    pages: [contentPage('/', 'Home'), contentPage('/guide', 'Guide')],
  });

  expect(article.layout).toBe('doc');
  expect(article.text.home).toBe('概览');
  expect(article.lang).toBe('zh-CN');
});

test('语言范围解析', () => {
  const root: DocsFrontmatter = {
    locales: {
      '/zh/': { lang: 'zh-CN', label: '简体中文' },
      '/en/': { lang: 'en', label: 'English' },
    },
  };
  const pages = [
    contentPage('/', 'Home', root),
    contentPage('/zh', '概览'),
    contentPage('/zh/guide', '指南'),
    contentPage('/en/guide', 'Guide'),
  ];
  const data = resolveDocs({
    site: { title: 'Site' },
    page: currentPage('/zh/guide'),
    pages,
  });

  expect(data.home).toBe('/zh');
  expect(data.lang).toBe('zh-CN');
  expect(data.text.home).toBe('概览');
  expect(data.searchDirectory).toBe('zh');
  expect(data.languages).toHaveLength(2);

  expect(data.languages.find(item => item.lang === 'en')?.url).toBe(
    '/en/guide',
  );

  expect(data.languages.find(item => item.lang === 'zh-CN')).toMatchObject({
    label: '简体中文',
    current: true,
    url: '/zh/guide',
  });
});

test('语言范围校验', () => {
  expect(() =>
    resolveDocs({
      site: {},
      page: currentPage('/'),
      pages: [
        contentPage('/', 'Home', {
          locales: { zh: { lang: 'zh', label: '中文' } },
        }),
      ],
    }),
  ).toThrow('Invalid locale prefix: zh.');

  expect(() =>
    resolveDocs({
      site: {},
      page: currentPage('/'),
      pages: [
        contentPage('/', 'Home', {
          locales: { '/zh/': { lang: '', label: '中文' } },
        }),
      ],
    }),
  ).toThrow('Locale /zh/ requires lang and label.');

  expect(() =>
    resolveDocs({
      site: {},
      page: currentPage('/'),
      pages: [
        contentPage('/', 'Home', {
          locales: {
            '/zh/': { lang: 'zh-CN', label: '中文' },
            '/cn/': { lang: 'zh-CN', label: '中文' },
          },
        }),
      ],
    }),
  ).toThrow('Duplicate locale language: zh-CN.');
});

test('多语言首页覆盖根导航配置', () => {
  const pages = [
    contentPage('/', 'Home', {
      locales: { '/zh/': { lang: 'zh-CN', label: '中文' } },
      nav: [{ label: 'Root', href: '/zh' }],
    }),
    contentPage('/zh', '概览', { nav: [{ label: '本地', href: '/zh' }] }),
  ];
  const data = resolveDocs({
    site: {},
    page: currentPage('/zh'),
    pages,
  });

  expect(data.isHome).toBe(true);
  expect(data.layout).toBe('home');
  expect(data.site.nav).toEqual([{ label: '本地', href: '/zh' }]);
});

test('多语言首页导航空值处理', () => {
  const root: DocsFrontmatter = {
    locales: { '/zh/': { lang: 'zh-CN', label: '中文' } },
    nav: [{ label: 'Root', href: '/zh' }],
  };
  const inherit = resolveDocs({
    site: {},
    page: currentPage('/zh'),
    pages: [contentPage('/', 'Home', root), contentPage('/zh', '概览')],
  });

  expect(inherit.site.nav).toEqual([{ label: 'Root', href: '/zh' }]);

  const cleared = resolveDocs({
    site: {},
    page: currentPage('/zh'),
    pages: [
      contentPage('/', 'Home', root),
      contentPage('/zh', '概览', { nav: [] }),
    ],
  });

  expect(cleared.site.nav).toEqual([]);

  expect(() =>
    resolveDocs({
      site: {},
      page: currentPage('/zh'),
      pages: [
        contentPage('/', 'Home', root),
        contentPage('/zh', '概览', { nav: null } as unknown as DocsFrontmatter),
      ],
    }),
  ).toThrow('nav must be an array of sections, links or dropdowns.');
});

test('导航与面包屑', () => {
  const root: DocsFrontmatter = {
    nav: [
      {
        label: '指南',
        sidebar: [
          {
            label: '开始',
            items: [
              { href: '/zh/guide', label: '介绍' },
              { href: '/zh/guide/install' },
            ],
          },
        ],
      },
      { label: 'GitHub', href: 'https://github.com/xueelf/phyllo' },
    ],
  };
  const pages = [
    contentPage('/', 'Home', root),
    contentPage('/zh', '概览'),
    contentPage('/zh/guide', '介绍'),
    contentPage('/zh/guide/install', '安装'),
  ];
  const data = resolveDocs({
    site: {},
    page: currentPage('/zh/guide/install'),
    pages,
  });

  expect(data.activeNav?.label).toBe('指南');
  expect(data.breadcrumbs).toEqual(['开始']);
  expect(data.sections).toHaveLength(1);
  expect(data.sections[0]?.label).toBe('开始');

  expect(data.pages.map(article => article.href)).toEqual([
    '/zh/guide',
    '/zh/guide/install',
  ]);
  expect(data.pages[1]?.label).toBe('安装');
  expect(data.nav[0]).toMatchObject({ label: '指南', href: '/zh/guide' });

  expect(data.nav[1]).toMatchObject({
    label: 'GitHub',
    href: 'https://github.com/xueelf/phyllo',
  });
});

test('导航校验', () => {
  const cases: [DocsFrontmatter, string][] = [
    [
      {
        nav: [
          {
            label: '指南',
            sidebar: [{ label: '开始', items: [{ href: '/missing' }] }],
          },
        ],
      },
      'Sidebar article not found: /missing',
    ],
    [
      { nav: [{ label: '指南', href: 'foo' }] },
      'Link must be an absolute path or URL: foo',
    ],
    [
      { nav: [{ label: '指南' } as never] },
      'Nav sections require label and a non-empty sidebar.',
    ],
    [
      { nav: [{ href: '/guide' } as never] },
      'Nav entries require label and either href or sidebar.',
    ],
  ];

  for (const [root, message] of cases) {
    expect(() =>
      resolveDocs({
        site: {},
        page: currentPage('/guide'),
        pages: [contentPage('/', 'Home', root), contentPage('/guide', 'Guide')],
      }),
    ).toThrow(message);
  }

  // 重定向与公共文件不在内容页面集合中，导航链接只校验地址形式。
  const linked = resolveDocs({
    site: {},
    page: currentPage('/guide'),
    pages: [
      contentPage('/', 'Home', {
        nav: [
          { label: '重定向', href: '/old-guide' },
          { label: '公共文件', href: '/manual.pdf' },
        ],
      }),
      contentPage('/guide', 'Guide'),
    ],
  });

  expect(linked.nav).toEqual([
    { label: '重定向', href: '/old-guide' },
    { label: '公共文件', href: '/manual.pdf' },
  ]);

  expect(() =>
    resolveDocs({
      site: {},
      page: currentPage('/guide'),
      pages: [
        contentPage('/', 'Home', {
          nav: [
            {
              label: 'A',
              sidebar: [{ label: 'S', items: [{ href: '/guide' }] }],
            },
            {
              label: 'B',
              sidebar: [{ label: 'S', items: [{ href: '/guide' }] }],
            },
          ],
        }),
        contentPage('/guide', 'Guide'),
      ],
    }),
  ).toThrow('Duplicate navigation article: /guide');
});

test('布局校验', () => {
  expect(() =>
    resolveDocs({
      site: {},
      page: currentPage('/guide', { layout: 'blog' as never }),
      pages: [contentPage('/', 'Home'), contentPage('/guide', 'Guide')],
    }),
  ).toThrow('Invalid layout for /guide: blog');

  const data = resolveDocs({
    site: {},
    page: currentPage('/guide', { layout: false }),
    pages: [contentPage('/', 'Home'), contentPage('/guide', 'Guide')],
  });

  expect(data.layout).toBe(false);
});

test('首页配置结构校验', () => {
  const resolve = (frontmatter: DocsFrontmatter) =>
    resolveDocs({
      site: {},
      page: currentPage('/', frontmatter),
      pages: [contentPage('/', 'Home')],
    });

  expect(() => resolve({ hero: false as never })).toThrow(
    'hero must be an object',
  );

  expect(() => resolve({ hero: { image: 'pic.svg' } as never })).toThrow(
    'hero.image requires src and alt.',
  );

  expect(() => resolve({ hero: { title: null } as never })).toThrow(
    'hero.title must be a string.',
  );

  expect(() => resolve({ hero: { title: 123 } as never })).toThrow(
    'hero.title must be a string.',
  );

  expect(() => resolve({ hero: { description: false } as never })).toThrow(
    'hero.description must be a string.',
  );

  expect(() => resolve({ hero: { actions: null } as never })).toThrow(
    'hero.actions requires links with label and href.',
  );

  expect(() => resolve({ hero: { actions: 'start' } as never })).toThrow(
    'hero.actions requires links with label and href.',
  );

  expect(() =>
    resolve({ hero: { actions: [{ label: '', href: '/guide' }] } }),
  ).toThrow('hero.actions requires links with label and href.');

  expect(() => resolve({ features: { wrong: 'value' } as never })).toThrow(
    'features must be an array',
  );

  expect(() => resolve({ features: [{} as never] })).toThrow(
    'features must be an array',
  );

  // 合法的空数组与空字符串保留，不套用默认值。
  expect(resolve({ features: [] }).layout).toBe('home');

  expect(resolve({ hero: { title: '' } }).layout).toBe('home');

  expect(resolve({ hero: { actions: [] } }).layout).toBe('home');

  expect(
    resolve({
      hero: { title: 'Hello', actions: [{ label: 'Start', href: '/guide' }] },
      features: [],
    }).layout,
  ).toBe('home');
});

test('搜索配置', () => {
  const local = resolveDocs({
    site: { search: true },
    page: currentPage('/guide'),
    pages: [contentPage('/', 'Home'), contentPage('/guide', 'Guide')],
  });

  expect(local.search).toEqual({ provider: 'local' });

  expect(() =>
    resolveDocs({
      site: {},
      page: currentPage('/guide'),
      pages: [
        contentPage('/', 'Home', { search: { provider: 'local' } }),
        contentPage('/guide', 'Guide'),
      ],
    }),
  ).toThrow('Local search requires search: true in phyllo.config.ts.');

  const algolia = resolveDocs({
    site: {},
    page: currentPage('/guide'),
    pages: [
      contentPage('/', 'Home', {
        search: {
          provider: 'algolia',
          options: { appId: 'A', apiKey: 'K', indexName: 'I' },
        },
      }),
      contentPage('/guide', 'Guide'),
    ],
  });

  expect(algolia.search).toMatchObject({ provider: 'algolia' });

  expect(() =>
    resolveDocs({
      site: {},
      page: currentPage('/guide'),
      pages: [
        contentPage('/', 'Home', {
          search: {
            provider: 'algolia',
            options: { appId: '', apiKey: 'K', indexName: 'I' },
          },
        }),
        contentPage('/guide', 'Guide'),
      ],
    }),
  ).toThrow(
    'Algolia search requires appId, apiKey and indexName in search.options.',
  );

  expect(() =>
    resolveDocs({
      site: {},
      page: currentPage('/guide'),
      pages: [
        contentPage('/', 'Home', {
          search: { provider: 'meilisearch' } as never,
        }),
        contentPage('/guide', 'Guide'),
      ],
    }),
  ).toThrow('search.provider must be local or algolia.');

  const disabled = resolveDocs({
    site: { search: true },
    page: currentPage('/guide'),
    pages: [
      contentPage('/', 'Home', { search: false }),
      contentPage('/guide', 'Guide'),
    ],
  });

  expect(disabled.search).toBe(false);
});

test('站点标识与链接校验', () => {
  expect(() =>
    resolveDocs({
      site: {},
      page: currentPage('/guide'),
      pages: [contentPage('/', 'Home', { logo: '  ' })],
    }),
  ).toThrow('logo must be an image URL.');

  expect(() =>
    resolveDocs({
      site: {},
      page: currentPage('/guide'),
      pages: [
        contentPage('/', 'Home', {
          links: [{ icon: 'github', href: '/guide', label: 'GitHub' } as never],
        }),
        contentPage('/guide', 'Guide'),
      ],
    }),
  ).toThrow('Site links require icon and href, without label.');

  expect(() =>
    resolveDocs({
      site: {},
      page: currentPage('/guide'),
      pages: [
        contentPage('/', 'Home', {
          links: [{ icon: 'nope' as never, href: '/guide' }],
        }),
        contentPage('/guide', 'Guide'),
      ],
    }),
  ).toThrow('Unsupported link icon: nope');
});
