import { file, hash } from 'bun';
import { realpath } from 'node:fs/promises';
import { extname } from 'node:path';

import { type Project, assertInputOutsideOutdir } from '../config/project';

/** 通过模块导入的静态资源扩展名。 */
export const ASSET_MODULE = /\.(?:avif|gif|ico|jpe?g|png|svg|webp)$/i;

/** 构建端资源模块的命名空间。 */
export const ASSET_NAMESPACE = 'phyllo-asset';

/**
 * 把静态资源写入构建产物，生成导出 URL 的模块代码。
 *
 * 服务端、构建端与开发端的客户端共用同一套内容哈希地址，避免路径不一致。
 *
 * @param project - 解析后的站点工程信息。
 * @param path - 资源文件的绝对路径。
 * @param files - 收集构建产物的映射。
 * @returns 模块代码。
 * @throws 资源位于输出目录内时抛出错误。
 */
export async function assetModule(
  project: Project,
  path: string,
  files: Map<string, Blob | string>,
): Promise<string> {
  assertInputOutsideOutdir(project.outdir, await realpath(path));

  const asset = file(path);
  const bytes = await asset.arrayBuffer();
  const target = `_phyllo/media/${hash(bytes).toString(16)}${extname(path)}`;

  files.set(target, new Blob([bytes], { type: asset.type }));

  return `export default ${JSON.stringify(`/${target}`)};`;
}
