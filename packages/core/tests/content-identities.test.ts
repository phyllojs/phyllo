import { expect, test } from 'bun:test';

import { logicalContentFile } from '../src/content';

test('内容模块按真实目录映射还原逻辑文件路径', () => {
  const directories = new Map([
    ['/external/source', '/site/content/published'],
    ['/site/content/inner', '/site/content/inner'],
  ]);

  // 真实目录映射到 `content/` 下的逻辑目录。
  expect(logicalContentFile('/external/source/article.mdx', directories)).toBe(
    '/site/content/published/article.mdx',
  );

  // 查询只用于模块缓存标识，不参与路径判断。
  expect(
    logicalContentFile(
      '/external/source/article.mdx?phyllo-content=abcdef',
      directories,
    ),
  ).toBe('/site/content/published/article.mdx');

  // 内容目录内的真实目录映射到自身。
  expect(logicalContentFile('/site/content/inner/x.mdx', directories)).toBe(
    '/site/content/inner/x.mdx',
  );

  // 未参与页面扫描的子目录按最近的已映射祖先目录换算。
  expect(
    logicalContentFile('/external/source/.fragments/note.mdx', directories),
  ).toBe('/site/content/published/.fragments/note.mdx');

  expect(
    logicalContentFile(
      '/site/content/inner/.fragments/deep/x.mdx',
      directories,
    ),
  ).toBe('/site/content/inner/.fragments/deep/x.mdx');

  // 主题文件与未映射目录保持原路径。
  expect(
    logicalContentFile('/site/themes/docs/src/frag.mdx', directories),
  ).toBe('/site/themes/docs/src/frag.mdx');

  expect(logicalContentFile('/external/other/y.mdx', directories)).toBe(
    '/external/other/y.mdx',
  );

  expect(
    logicalContentFile('/external/other/.fragments/y.mdx', directories),
  ).toBe('/external/other/.fragments/y.mdx');
});
