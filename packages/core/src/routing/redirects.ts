import type { Config } from '../config';

/**
 * 校验 redirects 的路由写法。
 *
 * @param redirects - 跳转映射，省略时不做校验。
 * @throws 地址不是站内规范路径时抛出错误。
 */
function validateRedirects(redirects: Config['redirects']): void {
  if (redirects === undefined) {
    return;
  }

  for (const [source, destination] of Object.entries(redirects)) {
    for (const route of [source, destination]) {
      if (
        !/^(?:\/|\/[^/?#]+(?:\/[^/?#]+)*)$/.test(route) ||
        /^\/_phyllo(?:\/|$)/.test(route) ||
        route
          .split('/')
          .slice(1)
          .some(segment => {
            try {
              const decoded = decodeURIComponent(segment);

              return (
                decoded === '.' ||
                decoded === '..' ||
                /[/\\]/.test(decoded) ||
                [...decoded].some(character => character.charCodeAt(0) < 32) ||
                encodeURIComponent(decoded) !== segment
              );
            } catch {
              return true;
            }
          })
      ) {
        throw new Error(
          `Invalid redirect route: ${route}. Use / or an encoded /directory URL without a trailing slash.`,
        );
      }
    }
  }
}

/**
 * 沿跳转链查找最终目标地址。
 *
 * @param source - 跳转来源地址。
 * @param targets - 跳转映射。
 * @returns 最终目标地址。
 * @throws 跳转链出现循环时抛出错误。
 */
function finalTarget(source: string, targets: Map<string, string>): string {
  const visited = new Set<string>();

  function step(current: string): string {
    const destination = targets.get(current);

    if (destination === undefined) {
      return current;
    }

    if (visited.has(current)) {
      throw new Error(`Redirect cycle starting at ${source}.`);
    }
    visited.add(current);

    return step(destination);
  }

  return step(source);
}

/**
 * 解析跳转映射，展开多级跳转并校验目标页面。
 *
 * @param redirects - 跳转映射，省略时返回空表。
 * @param pages - 已有的页面地址，用于校验目标页面。
 * @returns 来源地址到最终目标地址的映射。
 * @throws 存在循环跳转或目标页面不存在时抛出错误。
 */
export function resolveRedirects(
  redirects: Config['redirects'],
  pages: Set<string>,
): Map<string, string> {
  validateRedirects(redirects);

  if (redirects === undefined) {
    return new Map();
  }
  const targets = new Map(Object.entries(redirects));
  const resolved = new Map<string, string>();

  for (const source of targets.keys()) {
    const destination = finalTarget(source, targets);

    if (!pages.has(destination) && destination !== '/') {
      throw new Error(`Redirect destination does not exist: ${destination}`);
    }
    resolved.set(source, destination);
  }
  return resolved;
}
