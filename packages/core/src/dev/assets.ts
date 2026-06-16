import { hash } from 'bun';
import { basename, extname, join } from 'node:path';

/**
 * 需要跨重建刷新的资源文件。
 */
export const assetSources = new Set<string>();

/**
 * 资源文件对应的生成模块路径。
 *
 * @param workDir - 工作目录。
 * @param source - 资源文件的绝对路径。
 * @returns 生成模块的绝对路径。
 */
export function assetModulePath(workDir: string, source: string) {
  const name = basename(source, extname(source)).replace(
    /[^a-zA-Z0-9._-]/g,
    '_',
  );

  return join(
    workDir,
    'dev',
    'assets',
    `${name}-${hash(source).toString(16).slice(0, 8)}.ts`,
  );
}
