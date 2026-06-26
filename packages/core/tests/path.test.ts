import { expect, test } from 'bun:test';

import { isWithin } from '../src/utils/path';

test('路径段匹配', () => {
  expect(isWithin('/site', '/site')).toBe(true);
  expect(isWithin('/site', '/site/content')).toBe(true);
  expect(isWithin('/site/a', '/site/ab')).toBe(false);
  expect(isWithin('/site/a', '/site')).toBe(false);
});
