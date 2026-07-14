import { expect, test } from 'bun:test';

import { getSiteData, initializeSite } from '../src/site-data';

test('站点数据未初始化时读取报错', async () => {
  // 使用独立模块实例，避免其他测试文件已初始化共享存储。
  const specifier = '../src/site-data?uninitialized';
  const fresh = (await import(specifier)) as typeof import('../src/site-data');

  expect(() => fresh.getSiteData()).toThrow(
    'Phyllo site data has not been initialized.',
  );
});

test('初始化后读取站点与页面数据', () => {
  initializeSite({ title: 'Site' }, []);

  expect(getSiteData()).toEqual({ site: { title: 'Site' }, pages: [] });
});

test('重新初始化覆盖旧数据', () => {
  initializeSite({ title: '旧' }, []);
  initializeSite({ title: '新' }, []);

  expect(getSiteData().site.title).toBe('新');
});
