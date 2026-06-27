import { expect, test } from 'bun:test';

import { reactAttribute } from '../src/dev/server';

test('head 属性转换为 React 名与布尔值', () => {
  expect(reactAttribute('crossorigin', '')).toEqual({
    property: 'crossOrigin',
    value: '',
  });

  expect(reactAttribute('srcset', 'a 1x')).toEqual({
    property: 'srcSet',
    value: 'a 1x',
  });

  expect(reactAttribute('nomodule', '')).toEqual({
    property: 'noModule',
    value: true,
  });

  expect(reactAttribute('fetchpriority', 'high')).toEqual({
    property: 'fetchPriority',
    value: 'high',
  });

  expect(reactAttribute('aria-label', '页面')).toEqual({
    property: 'aria-label',
    value: '页面',
  });

  expect(reactAttribute('data-x', '1')).toEqual({
    property: 'data-x',
    value: '1',
  });

  expect(reactAttribute('unknown-thing', 'v')).toEqual({
    property: 'unknown-thing',
    value: 'v',
  });
});
