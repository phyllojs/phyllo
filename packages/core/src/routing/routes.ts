/**
 * 页面 URL 与输出文件的对应关系。
 */
export interface RouteTable {
  /** 页面 URL 到输出文件名的映射。 */
  routes: Map<string, string>;
  /** 尾斜杠与 index.html 形式的别名，指向规范 URL。 */
  aliases: Map<string, string>;
}

/**
 * 生成页面路由表和尾斜杠、index.html 形式的别名。
 *
 * @param pages - 页面地址列表。
 * @param redirects - 需要生成跳转页的页面地址。
 * @returns 路由表与别名表。
 * @throws 两个地址生成同一个输出文件时抛出错误。
 */
export function resolveRoutes(
  pages: readonly string[],
  redirects: Iterable<string>,
): RouteTable {
  const routes = new Map<string, string>();
  const fileOwners = new Map<string, string>();

  for (const url of new Set(['/', ...pages, ...redirects])) {
    const filename =
      url === '/' ? 'index.html' : `${decodeURIComponent(url).slice(1)}.html`;
    const conflict = fileOwners.get(filename);

    if (conflict !== undefined) {
      throw new Error(
        `Routes ${conflict} and ${url} both generate ${filename}. Rename one of the content pages or redirects.`,
      );
    }
    fileOwners.set(filename, url);
    routes.set(url, filename);
  }
  const aliases = new Map<string, string>();

  for (const [url, filename] of routes) {
    for (const alias of [
      `${url}/`,
      `/${filename.split('/').map(encodeURIComponent).join('/')}`,
    ]) {
      if (alias !== '//' && !routes.has(alias)) {
        aliases.set(alias, url);
      }
    }
  }
  return { routes, aliases };
}
