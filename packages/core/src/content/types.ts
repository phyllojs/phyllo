import { join } from 'node:path';

import type { Project } from '../config/project';
import { writeIfChanged } from '../utils/fs';

import type { ContentPaths } from './paths';

/**
 * 生成 .phyllo/types.d.ts 的声明内容。
 *
 * @param paths - 内容目录中已有的页面地址和内容目录。
 * @returns 供 `phyllo sync` 写入的声明文本。
 */
export function createTypeSource({ pages, directories }: ContentPaths): string {
  return [
    '// 由 Phyllo 自动生成，请勿编辑。',
    "import 'phyllo';",
    '',
    "declare module 'phyllo' {",
    '  interface ContentPages {',
    ...pages.map(page => `    ${JSON.stringify(page)}: true;`),
    '  }',
    '',
    '  interface ContentDirectories {',
    ...directories.map(directory => `    ${JSON.stringify(directory)}: true;`),
    '  }',
    '}',
    '',
  ].join('\n');
}

/**
 * 生成 .phyllo/mdx.d.ts 的声明内容。
 *
 * 通配声明必须位于脚本文件（无顶层 import/export），类型导入放在声明内部。
 *
 * @returns MDX 通配模块声明文本。
 */
export function createMdxTypeSource(): string {
  return [
    '// 由 Phyllo 自动生成，请勿编辑。',
    '',
    "declare module '*.mdx' {",
    "  import type { Frontmatter } from 'phyllo/types';",
    '  export const frontmatter: Frontmatter;',
    '}',
    '',
  ].join('\n');
}

/**
 * 生成类型声明并写入 .phyllo。
 *
 * @param project - 解析后的站点工程信息。
 * @param paths - 页面地址和内容目录。
 * @returns 写入的主声明文件路径。
 */
export async function writeTypes(
  project: Project,
  paths: ContentPaths,
): Promise<string> {
  const filename = join(project.workDir, 'types.d.ts');

  await Promise.all([
    writeIfChanged(filename, createTypeSource(paths)),
    writeIfChanged(join(project.workDir, 'mdx.d.ts'), createMdxTypeSource()),
  ]);

  return filename;
}
