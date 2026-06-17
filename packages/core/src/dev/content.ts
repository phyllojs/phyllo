import { hash } from 'bun';
import { basename, extname, join } from 'node:path';

/**
 * 已加载的内容源。引用资源或编译配置变化时据此重写桥接模块。
 */
export const contentSources = new Set<string>();

/**
 * 内容源对应的桥接模块路径。
 *
 * @param workDir - 工作目录。
 * @param source - 内容源文件的绝对路径。
 * @returns 桥接模块的绝对路径。
 */
export function contentBridgePath(workDir: string, source: string) {
  const name = basename(source, extname(source)).replace(
    /[^a-zA-Z0-9._-]/g,
    '_',
  );

  return join(
    workDir,
    'dev',
    'content',
    `${name}-${hash(source).toString(16).slice(0, 8)}.ts`,
  );
}
