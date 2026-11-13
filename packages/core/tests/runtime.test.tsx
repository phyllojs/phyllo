import { expect, test } from 'bun:test';

import { type ContentPage, type Resources, usePage } from 'phyllo';
import { createApp, HeadResources } from 'phyllo/render';
import type { ReactNode } from 'react';

import { createRenderer, renderRedirect } from '../src/runtime';

const PAGE: ContentPage = {
  url: '/page',
  title: 'Page',
  filePath: 'page.mdx',
  frontmatter: {},
  hasContent: true,
};
const PAGES = [PAGE];

function Page() {
  return <p>content</p>;
}

function Document({ children }: { children?: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <title>Theme title</title>
        <HeadResources />
      </head>
      <body>{children}</body>
    </html>
  );
}

function BareDocument({ children }: { children?: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <title>Theme title</title>
      </head>
      <body>{children}</body>
    </html>
  );
}

function HeadFragment({ children }: { children?: ReactNode }) {
  return (
    <>
      <head>
        <title>Partial</title>
        <HeadResources />
      </head>
      <body>{children}</body>
    </>
  );
}

function HeadFragmentBare({ children }: { children?: ReactNode }) {
  return (
    <>
      <head>
        <title>Partial</title>
      </head>
      <body>{children}</body>
    </>
  );
}

function BodyOnly({ children }: { children?: ReactNode }) {
  return <body>{children}</body>;
}

function Empty() {
  return null;
}

function Fragment({ children }: { children?: ReactNode }) {
  return <header>{children}</header>;
}

test('文档形态头部资源', async () => {
  const render = createRenderer(createApp({ Layout: Document, pages: PAGES }), {
    '/page': Page,
  });
  const resources: Resources = {
    styles: ['/a.css'],
    scripts: ['/a.js'],
    head: [{ tag: 'meta', attrs: { name: 'theme-color', content: 'red' } }],
  };
  const html = await render('/page', resources);

  expect(html).toContain('<p>content</p>');
  expect(html).toContain('<title>Theme title</title>');
  expect(html).toContain('rel="stylesheet" href="/a.css"');
  expect(html).toContain('type="module" src="/a.js"');
  expect(html).toContain('name="theme-color"');
  expect(html).toContain('"elements":["html","head","body"]');
});

test('各类主题记录实际页面并保留共享资源', async () => {
  const runtimePages = [
    ...PAGES,
    { ...PAGE, url: '/404', filePath: '404.mdx' },
  ];
  const resources: Resources = { styles: [], scripts: [] };

  for (const Layout of [Document, Fragment, Empty]) {
    const render = createRenderer(createApp({ Layout, pages: runtimePages }), {
      '/page': Page,
      '/404': Page,
    });

    const [notFound, page] = await Promise.all([
      render('/404', resources),
      render('/page', resources),
    ]);

    expect(notFound).toContain('"url":"/404"');
    expect(page).toContain('"url":"/page"');
  }

  expect(resources).toEqual({ styles: [], scripts: [] });
});

test('渲染器建立当前页面作用域', async () => {
  function CurrentPage() {
    return <p>{usePage().url}</p>;
  }

  const render = createRenderer(createApp({ Layout: Document, pages: PAGES }), {
    '/page': CurrentPage,
  });

  expect(await render('/page', { styles: [], scripts: [] })).toContain(
    '<p>/page</p>',
  );

  await expect(render('/missing', { styles: [], scripts: [] })).rejects.toThrow(
    'Cannot render unknown page: /missing',
  );
});

test('缺少头部资源的文档', async () => {
  const render = createRenderer(
    createApp({ Layout: BareDocument, pages: PAGES }),
    {
      '/page': Page,
    },
  );

  await expect(
    render('/page', { styles: [], scripts: [], head: [] }),
  ).rejects.toThrow(
    'The theme output has no <HeadResources />. Themes that render <html> or <head> must render <HeadResources /> from phyllo inside <head>.',
  );
});

test('缺少头部资源的局部文档', async () => {
  const render = createRenderer(
    createApp({ Layout: HeadFragmentBare, pages: PAGES }),
    { '/page': Page },
  );

  await expect(
    render('/page', { styles: [], scripts: [], head: [] }),
  ).rejects.toThrow(
    'The theme output has no <HeadResources />. Themes that render <html> or <head> must render <HeadResources /> from phyllo inside <head>.',
  );
});

test('文档资源必须放在 head 内', async () => {
  function Misplaced({ children }: { children?: ReactNode }) {
    return (
      <html>
        <head />
        <body>
          <HeadResources />
          {children}
        </body>
      </html>
    );
  }

  const render = createRenderer(
    createApp({ Layout: Misplaced, pages: PAGES }),
    {
      '/page': Page,
    },
  );

  await expect(render('/page', { styles: [], scripts: [] })).rejects.toThrow(
    'The theme output has no <HeadResources />. Themes that render <html> or <head> must render <HeadResources /> from phyllo inside <head>.',
  );
});

test('局部文档头部资源', async () => {
  const render = createRenderer(
    createApp({ Layout: HeadFragment, pages: PAGES }),
    {
      '/page': Page,
    },
  );
  const html = await render('/page', {
    styles: ['/a.css'],
    scripts: [],
    head: [],
  });

  expect(html).toContain('<title>Partial</title>');
  expect(html).toContain('rel="stylesheet" href="/a.css"');
  expect(html).toContain('<body><p>content</p></body>');
  expect(html).not.toContain('<html');
  expect(html).toContain('"elements":["head","body"]');
});

test('片段形态头部', async () => {
  const render = createRenderer(createApp({ Layout: Fragment, pages: PAGES }), {
    '/page': Page,
  });
  const html = await render('/page', {
    styles: ['/a.css'],
    scripts: [],
    head: [],
  });

  expect(html.startsWith('<!doctype html>\n')).toBe(true);
  expect(html).toContain('rel="stylesheet" href="/a.css"');
  expect(html).toContain('<header><p>content</p></header>');
  expect(html).not.toContain('<html');
  expect(html).toContain('id="phyllo-resources"');
});

test('仅正文的文档形态', async () => {
  const render = createRenderer(createApp({ Layout: BodyOnly, pages: PAGES }), {
    '/page': Page,
  });
  const html = await render('/page', {
    styles: ['/a.css'],
    scripts: [],
    head: [],
  });

  expect(html.startsWith('<!doctype html>\n')).toBe(true);
  expect(html).toContain('rel="stylesheet" href="/a.css"');
  expect(html).toContain('<body><p>content</p></body>');
  expect(html).not.toContain('<html');
  expect(html).toContain('id="phyllo-resources"');
});

test('空主题', async () => {
  const render = createRenderer(createApp({ Layout: Empty, pages: PAGES }), {
    '/page': Page,
  });
  const html = await render('/page', {
    styles: [],
    scripts: [],
    head: [],
  });

  expect(html.startsWith('<!doctype html>\n')).toBe(true);
  expect(html).toContain('id="phyllo-resources"');
  expect(html).not.toContain('<html');
});

test('重定向页面', () => {
  const html = renderRedirect('/zh');

  expect(html).toContain('<meta http-equiv="refresh" content="0;url=/zh"/>');
  expect(html).toContain('location.replace("/zh")');
  expect(html).toContain('<noscript><a href="/zh">/zh</a></noscript>');
});
