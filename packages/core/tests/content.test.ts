import { expect, test } from 'bun:test';

import type { Root } from 'hast';

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
    theme: 'phyllo-theme-example',
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
    '/site/content/example.mdx',
    ['# Hello', '', 'Body'].join('\n'),
  );

  expect(heading.page).toMatchObject({
    url: '/example',
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
    compileContent(
      project,
      '/site/content/example.mdx',
      ['---', 'title: 1', '---', ''].join('\n'),
    ),
  ).rejects.toThrow('Frontmatter title must be a string: example.mdx');

  await expect(
    compileContent(
      project,
      '/site/content/example.mdx',
      ['---', '- a', '---', ''].join('\n'),
    ),
  ).rejects.toThrow('Frontmatter must be an object: example.mdx');
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
    '/site/content/example.mdx',
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
    '/site/content/example.mdx',
    ['---', 'description: Desc', '---', '# Title'].join('\n'),
  );

  expect(result.page.description).toBe('Desc');
});

test('锚点去重', async () => {
  await expect(
    compileContent(
      project,
      '/site/content/example.mdx',
      ['## One \\{#same\\}', '', '## Two \\{#same\\}'].join('\n'),
    ),
  ).rejects.toThrow('Duplicate anchor #same in /example');
});

test('相对链接改写', async () => {
  const result = await compileContent(
    project,
    '/site/content/example.mdx',
    '[Read](./other.md)',
  );

  expect(result.code).toContain('"/other"');
});

test('链接越界报错', async () => {
  await expect(
    compileContent(project, '/site/content/example.mdx', '[Up](../outside.md)'),
  ).rejects.toThrow(
    'Content link escapes the content directory: example.mdx: ../outside.md',
  );
});

test('搜索分节', async () => {
  const result = await compileContent(
    project,
    '/site/content/example.mdx',
    ['# Title', '', 'intro', '', '## Section', '', 'body'].join('\n'),
  );
  const [page, section] = result.search;

  expect(result.search).toHaveLength(2);

  expect(page).toMatchObject({
    url: '/example',
    heading: '',
    text: 'intro',
  });

  expect(section).toMatchObject({
    url: '/example#section',
    heading: 'Section',
    text: 'body',
  });
});

test.each(['md', 'mdx'])('搜索文本保留行内词语与块分隔（%s）', async format => {
  const result = await compileContent(
    project,
    `/site/content/example.${format}`,
    [
      'hel**lo** world',
      '',
      '你`好`世界',
      '',
      'one<br />two',
      '',
      '- three',
      '- four',
      '',
      '| a | b |',
      '| - | - |',
      '| c | d |',
    ].join('\n'),
  );

  const [page] = result.search;

  expect(page?.text).toBe('hello world 你好世界 one two three four a b c d');
});

test('关闭搜索仍生成页面标题和锚点', async () => {
  const result = await compileContent(
    { ...project, config: { ...project.config, search: false } },
    '/site/content/example.mdx',
    ['# Hello', '', '## world', '', '你好世界'].join('\n'),
  );

  expect(result.page.title).toBe('Hello');
  expect(result.code).toContain('id="world"');
  expect(result.search).toEqual([]);
});

test('页面数据与搜索索引读取插件处理后的内容', async () => {
  const result = await compileContent(
    {
      ...project,
      config: {
        ...project.config,
        markdown: {
          ...project.config.markdown,
          rehypePlugins: [
            () => (tree: Root) => {
              for (const node of tree.children) {
                if (node.type === 'element' && /^h[12]$/.test(node.tagName)) {
                  node.properties.id = `${node.tagName}-final`;
                  node.children = [{ type: 'text', value: node.tagName }];
                }
              }
            },
          ],
        },
      },
    },
    '/site/content/example.mdx',
    ['# Original', '', '## Original section', '', 'hello world'].join('\n'),
  );
  const [, section] = result.search;

  expect(result.page.title).toBe('h1');
  expect(result.code).toContain('id="h2-final"');

  expect(section).toMatchObject({
    url: '/example#h2-final',
    title: 'h1',
    heading: 'h2',
    text: 'hello world',
  });
});

test('代码高亮保留搜索词语的连续性', async () => {
  const result = await compileContent(
    {
      ...project,
      config: {
        ...project.config,
        markdown: { ...project.config.markdown, highlight: true },
      },
    },
    '/site/content/example.mdx',
    ['```js', 'const hello = "你好世界";', '```'].join('\n'),
  );
  const [page] = result.search;

  expect(page?.text).toBe('const hello = "你好世界";');
});

test.each([false, true])(
  '正文状态读取插件处理后的内容（%j）',
  async content => {
    const result = await compileContent(
      {
        ...project,
        config: {
          ...project.config,
          markdown: {
            ...project.config.markdown,
            rehypePlugins: [
              () => (tree: Root) => {
                tree.children = content
                  ? [
                      {
                        type: 'element',
                        tagName: 'p',
                        properties: {},
                        children: [{ type: 'text', value: 'hello world' }],
                      },
                    ]
                  : [];
              },
            ],
          },
        },
      },
      '/site/content/example.mdx',
      content ? '' : 'hello world',
    );

    expect(result.page.hasContent).toBe(content);
    expect(result.search).toHaveLength(content ? 1 : 0);
  },
);

test.each(['md', 'mdx'])(
  'HTML 标题使用同一套锚点和分节规则（%s）',
  async format => {
    const result = await compileContent(
      project,
      `/site/content/example.${format}`,
      ['<h1>Hello</h1>', '', '<h2>world</h2>', '', '你好世界'].join('\n'),
    );

    const [, section] = result.search;

    expect(result.page.title).toBe('Hello');

    expect(section).toMatchObject({
      url: '/example#world',
      heading: 'world',
      text: '你好世界',
    });
  },
);

test('不改写动态 id，静态标题仍可搜索', async () => {
  const result = await compileContent(
    project,
    '/site/content/example.mdx',
    ['export const id = "world";', '', '<h2 id={id}>hello world</h2>'].join(
      '\n',
    ),
  );

  const [page] = result.search;

  expect(result.code).toContain('id={id}');
  expect(page?.text).toBe('hello world');
});

test('标题 id 遵循 JSX 属性展开顺序', async () => {
  const result = await compileContent(
    project,
    '/site/content/example.mdx',
    [
      'export const attrs = { id: "actual" };',
      '<h2 {...attrs}>hello</h2>',
      '<h2 id="static" {...attrs}>world</h2>',
      '<h2 {...attrs} id="fixed">你好世界</h2>',
      '<h2 {...attrs}>hello world</h2>',
    ].join('\n\n'),
  );

  const [page, section] = result.search;

  expect(result.code).not.toContain('id="hello"');

  expect(result.search.map(section => section.url)).toEqual([
    '/example',
    '/example#fixed',
  ]);
  expect(page?.text).toBe('hello world hello world');
  expect(section?.text).toBe('');
});

test.each(['md', 'mdx'])('搜索索引收录 HTML 正文（%s）', async format => {
  const result = await compileContent(
    project,
    `/site/content/example.${format}`,
    [
      '# hel<span>lo</span> world',
      '## 你<span>好</span>世界',
      '<div title="attribute_only">hello</div><div>world</div>',
      '<form>hello</form><fieldset><legend>world</legend></fieldset>',
      format === 'md'
        ? 'hello<!-- comment_only -->world'
        : [
            'hello{/* comment_only */}world',
            '',
            '{"expression_only"}',
            '',
            'hello<components.Widget />world',
          ].join('\n'),
      '<script>script_only</script>',
      '<style>style_only</style>',
    ].join('\n\n'),
  );

  const [, section] = result.search;

  expect(result.page.title).toBe('hello world');

  expect(section).toMatchObject({
    url: `/example#${encodeURIComponent('你好世界')}`,
    heading: '你好世界',
    text:
      format === 'md'
        ? 'hello world hello world helloworld'
        : 'hello world hello world helloworld hello world',
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
