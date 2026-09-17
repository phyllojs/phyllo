import { expect, test } from 'bun:test';

import { isValidPackageName, validatePackageName } from '../src/scaffold';

test('包名校验', () => {
  expect(isValidPackageName('my-site')).toBe(true);
  expect(isValidPackageName('@scope/theme')).toBe(true);
  expect(isValidPackageName('中文站点')).toBe(false);
  expect(isValidPackageName('----')).toBe(false);
  expect(isValidPackageName('MySite')).toBe(false);
  expect(isValidPackageName('-site')).toBe(false);
  expect(isValidPackageName('node_modules')).toBe(false);
  expect(isValidPackageName('favicon.ico')).toBe(false);
  expect(isValidPackageName('a'.repeat(215))).toBe(false);
});

test('包名报错', () => {
  expect(() => validatePackageName('----')).toThrow(
    'Use an npm package name, such as phyllo-theme-example or @scope/theme.',
  );
});
