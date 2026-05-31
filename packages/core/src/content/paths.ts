/**
 * 从文章文件推导出的页面地址和内容目录。
 */
export interface ContentPaths {
  /** 页面地址，按字典序排列。 */
  pages: string[];
  /** 内容目录，按字典序排列，包含各级父目录。 */
  directories: string[];
}

/**
 * 从内容目录中的相对路径推导页面地址。
 *
 * @param filePath - 相对于内容目录的文件路径，使用 `/` 分隔。
 * @returns 页面的规范地址，根路径为 `/`。
 * @throws 文件位于保留的 `/_phyllo/` 目录时抛出错误。
 */
export function pageUrl(filePath: string): string {
  const path = filePath.replace(/\.mdx?$/, '');

  if (path === '_phyllo' || path.startsWith('_phyllo/')) {
    throw new Error('The /_phyllo/ route is reserved for build resources.');
  }
  const route = path === 'index' ? '' : path.replace(/\/index$/, '');

  return `/${route.split('/').map(encodeURIComponent).join('/')}`;
}

/**
 * 从文章文件推导页面地址，以及可供搜索筛选的内容目录。
 *
 * @param files - 相对于内容目录的文件路径列表。
 * @returns 去重并排序后的页面地址和内容目录。
 */
export function contentPaths(files: readonly string[]): ContentPaths {
  const pages = new Set<string>();
  const directories = new Set<string>();

  for (const file of files) {
    pages.add(pageUrl(file));

    const parts = file.split('/');

    parts.pop();

    for (const index of parts.keys()) {
      const directory = parts.slice(0, index + 1).join('/');

      directories.add(directory);
    }
  }
  return {
    pages: [...pages].sort(),
    directories: [...directories].sort(),
  };
}
