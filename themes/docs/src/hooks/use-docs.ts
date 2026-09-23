import { usePage, usePages, useSite } from 'phyllo';

import { resolveDocs } from './docs-data';

/**
 * 读取文档主题所需的站点、导航、语言与搜索数据。
 *
 * @returns 主题布局使用的数据集合。
 * @throws 站点或页面数据不合法时抛出错误。
 */
export function useDocs() {
  return resolveDocs({
    site: useSite(),
    page: usePage(),
    pages: usePages(),
  });
}
