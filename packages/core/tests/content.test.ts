import { expect, test } from 'bun:test';

import type { Project } from '../src/config/project';
import { findRouteConflicts } from '../src/content';
import { compileContent } from '../src/content/compile';
import { contentPaths, pageUrl } from '../src/content/paths';
import { createMdxTypeSource, createTypeSource } from '../src/content/types';

const project: Project = {
  root: '/site',
  content: '/site/content',
  outdir: '/site/dist',
  workDir: '/site/.phyllo',
  configHash: 'test',
  head: [],
  config: {
    theme: 'phyllo-theme-test',
    title: 'Site title',
    description: 'Site description',
    content: 'content',
    outdir: 'dist',
    head: {},
    redirects: {},
    search: true,
    markdown: { highlight: false, remarkPlugins: [], rehypePlugins: [] },
  },
};

test('页面路由映射', () => {
  expect(pageUrl('index.mdx')).toBe('/');
  expect(pageUrl('guide/index.md')).toBe('/guide');
  expect(pageUrl('guide/setup.mdx')).toBe('/guide/setup');

  expect(pageUrl('中文/文章.mdx')).toBe(
    `/${encodeURIComponent('中文')}/${encodeURIComponent('文章')}`,
  );
});

test('保留前缀报错', () => {
  expect(() => pageUrl('_phyllo/a.mdx')).toThrow(
    'The /_phyllo/ route is reserved for build resources.',
  );
});

test('标题与内容状态', async () => {
  const heading = await compileContent(
    project,
    '/site/content/foo.mdx',
    '# Hello\n\nBody',
  );

  expect(heading.page).toMatchObject({
    url: '/foo',
    title: 'Hello',
    hasContent: true,
  });

  const index = await compileContent(
    project,
    '/site/content/index.mdx',
    'Body',
  );

  expect(index.page).toMatchObject({
    url: '/',
    title: 'Site title',
    hasContent: true,
  });

  const empty = await compileContent(project, '/site/content/empty.mdx', '');

  expect(empty.page).toMatchObject({
    url: '/empty',
    title: 'empty',
    hasContent: false,
  });
});

test('frontmatter 校验', async () => {
  await expect(
    compileContent(project, '/site/content/foo.mdx', '---\ntitle: 1\n---\n'),
  ).rejects.toThrow('Frontmatter title must be a string: foo.mdx');

  await expect(
    compileContent(project, '/site/content/foo.mdx', '---\n- a\n---\n'),
  ).rejects.toThrow('Frontmatter must be an object: foo.mdx');
});

test('Markdown 中的 HTML', async () => {
  const markdown = await compileContent(
    project,
    '/site/content/page.md',
    '<div class="notice">Visible HTML</div>\n',
  );

  expect(markdown.code).toContain('className="notice"');
  expect(markdown.code).toContain('Visible HTML');

  const mdx = await compileContent(
    project,
    '/site/content/page.mdx',
    '<div className="notice">Visible HTML</div>\n',
  );

  expect(mdx.code).toContain('className="notice"');
  expect(mdx.code).toContain('Visible HTML');
});

test('导入说明符保持源码写法', async () => {
  const result = await compileContent(
    project,
    '/site/content/foo.mdx',
    [
      '---',
      'title: T',
      '---',
      '',
      "export const example = `import Widget from './Widget.tsx';`;",
      "import Widget from './Widget.tsx';",
      '',
      "export const lazy = () => import('./Lazy.tsx');",
      '',
      '<Widget />',
      '',
    ].join('\n'),
  );

  expect(result.code).toContain("import Widget from './Widget.tsx';");
  expect(result.code).toContain("`import Widget from './Widget.tsx';`");
  expect(result.code).toContain("import('./Lazy.tsx')");
  expect(result.code).not.toContain('/site/content/Widget.tsx');
});

test('frontmatter 描述', async () => {
  const result = await compileContent(
    project,
    '/site/content/foo.mdx',
    '---\ndescription: Desc\n---\n# Title',
  );

  expect(result.page.description).toBe('Desc');
});

test('锚点去重', async () => {
  await expect(
    compileContent(
      project,
      '/site/content/foo.mdx',
      '## One \\{#same\\}\n\n## Two \\{#same\\}',
    ),
  ).rejects.toThrow('Duplicate anchor #same in /foo');
});

test('相对链接改写', async () => {
  const result = await compileContent(
    project,
    '/site/content/foo.mdx',
    '[Read](./other.md)',
  );

  expect(result.code).toContain('"/other"');
});

test('链接越界报错', async () => {
  await expect(
    compileContent(project, '/site/content/foo.mdx', '[Up](../outside.md)'),
  ).rejects.toThrow(
    'Content link escapes the content directory: foo.mdx: ../outside.md',
  );
});

test('搜索分节', async () => {
  const result = await compileContent(
    project,
    '/site/content/foo.mdx',
    '# Title\n\nintro\n\n## Section\n\nbody',
  );
  const [page, section] = result.search;

  expect(result.search).toHaveLength(2);

  expect(page).toMatchObject({
    url: '/foo',
    heading: '',
    text: 'intro',
  });

  expect(section).toMatchObject({
    url: '/foo#section',
    heading: 'Section',
    text: 'body',
  });
});

test('文章路径推导页面与目录', () => {
  expect(
    contentPaths([
      'index.mdx',
      'zh/guide/index.mdx',
      'zh/guide/routing.mdx',
      'zh/about/faq.mdx',
    ]),
  ).toEqual({
    pages: ['/', '/zh/about/faq', '/zh/guide', '/zh/guide/routing'],
    directories: ['zh', 'zh/about', 'zh/guide'],
  });
});

test('路由冲突收集', () => {
  expect(
    findRouteConflicts([
      { url: '/guide', file: 'guide.mdx' },
      { url: '/guide', file: 'guide/index.mdx' },
      { url: '/other', file: 'other.mdx' },
    ]),
  ).toEqual([{ url: '/guide', files: ['guide.mdx', 'guide/index.mdx'] }]);
});

test('类型声明内容', () => {
  const source = createTypeSource({
    pages: ['/', '/zh'],
    directories: ['zh'],
  });

  expect(source).toContain('interface ContentPages {');
  expect(source).toContain('"/": true;');
  expect(source).toContain('"/zh": true;');
  expect(source).toContain('interface ContentDirectories {');
  expect(source).toContain('"zh": true;');
});

test('MDX 通配声明内容', () => {
  const source = createMdxTypeSource();

  expect(source).toContain("declare module '*.mdx' {");
  expect(source).toContain("import type { Frontmatter } from 'phyllo/types';");
  expect(source).toContain('export const frontmatter: Frontmatter;');

  // 脚本文件：声明块之前不能出现顶层 import/export。
  expect(source.indexOf('declare module')).toBeLessThan(
    source.indexOf('import type'),
  );
  expect(source).not.toContain('export {}');
});
