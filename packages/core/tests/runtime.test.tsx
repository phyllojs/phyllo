import { expect, test } from 'bun:test';

import type { ContentPage, Resources } from 'phyllo';
import { createApp, HeadResources } from 'phyllo/render';
import type { ReactNode } from 'react';

import { createRenderer, renderRedirect } from '../src/runtime';

const pages: ContentPage[] = [
  {
    url: '/page',
    title: 'Page',
    filePath: 'page.mdx',
    frontmatter: {},
    hasContent: true,
  },
];

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
  const render = createRenderer(createApp({ Layout: Document, pages }), {
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

test('缺少头部资源的文档', async () => {
  const render = createRenderer(createApp({ Layout: BareDocument, pages }), {
    '/page': Page,
  });

  await expect(
    render('/page', { styles: [], scripts: [], head: [] }),
  ).rejects.toThrow('no <HeadResources />');
});

test('缺少头部资源的局部文档', async () => {
  const render = createRenderer(
    createApp({ Layout: HeadFragmentBare, pages }),
    { '/page': Page },
  );

  await expect(
    render('/page', { styles: [], scripts: [], head: [] }),
  ).rejects.toThrow('no <HeadResources />');
});

test('局部文档头部资源', async () => {
  const render = createRenderer(createApp({ Layout: HeadFragment, pages }), {
    '/page': Page,
  });
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
  const render = createRenderer(createApp({ Layout: Fragment, pages }), {
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
  const render = createRenderer(createApp({ Layout: BodyOnly, pages }), {
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
  const render = createRenderer(createApp({ Layout: Empty, pages }), {
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
  expect(html).toContain('<a href="/zh">/zh</a>');
});
