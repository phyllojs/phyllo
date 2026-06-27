import { expect, test } from 'bun:test';

import { assertOutputPaths } from '../src/build';

test('产物路径必须位于输出目录内', () => {
  expect(() =>
    assertOutputPaths(['_phyllo/app.js', 'zh/index.html'], '/site/dist'),
  ).not.toThrow();

  expect(() =>
    assertOutputPaths(['../external/article.html'], '/site/dist'),
  ).toThrow(
    'Output file escapes the output directory: ../external/article.html',
  );
});
