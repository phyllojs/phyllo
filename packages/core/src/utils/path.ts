import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';

/**
 * 向上查找包含 package.json 的目录。
 *
 * @param directory - 起始目录。
 * @returns 最近的包目录，找不到时返回文件系统根目录。
 */
export function findPackageRoot(directory: string): string {
  const parent = dirname(directory);

  return existsSync(join(directory, 'package.json')) || parent === directory
    ? directory
    : findPackageRoot(parent);
}

/**
 * 按完整路径段判断 child 是否位于 parent 内。
 *
 * @param parent - 父目录路径。
 * @param child - 待判断的路径。
 * @returns child 位于 parent 内时为 `true`。
 */
export function isWithin(parent: string, child: string): boolean {
  const path = relative(parent, child);

  return (
    path === '' ||
    (!isAbsolute(path) && path !== '..' && !path.startsWith(`..${sep}`))
  );
}
