import { file } from 'bun';
import { mkdir, realpath, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import type { HeadTag } from 'phyllo';

import { resolvePath } from '../utils/fs';
import { importFresh } from '../utils/module';
import { isWithin } from '../utils/path';

import {
  type Config,
  type ResolvedConfig,
  resolveConfig,
  resolveHead,
} from './index';

/**
 * 解析后的站点工程信息。
 */
export interface Project {
  /** 站点根目录的绝对路径。 */
  root: string;
  /** 内容目录的绝对路径。 */
  content: string;
  /** 构建输出目录的绝对路径。 */
  outdir: string;
  /** .phyllo 工作目录，存放生成的入口、类型声明和 Bun 配置。 */
  workDir: string;
  /** 补齐默认值后的站点配置。 */
  config: ResolvedConfig;
  /** 配置文件内容哈希，用于判断能否复用编译缓存。 */
  configHash: string;
  /** 配置声明的 head 标签。 */
  head: HeadTag[];
}

/**
 * 断言构建输入不在输出目录内：清理输出目录会删除这些输入。
 *
 * @param outdir - 输出目录的绝对路径。
 * @param path - 输入文件的真实路径。
 * @throws 文件位于输出目录内时抛出错误。
 */
export function assertInputOutsideOutdir(outdir: string, path: string) {
  if (isWithin(outdir, path)) {
    throw new Error(
      `Build input must not be inside the output directory: ${path}`,
    );
  }
}

/**
 * 断言打包输入都不在输出目录内。
 *
 * 调用方应在打包完成后、工作目录可能变化前，把元数据输入转换为绝对路径。
 *
 * @param outdir - 输出目录的绝对路径。
 * @param inputs - 输入文件的绝对路径集合。
 * @throws 任一输入位于输出目录内时抛出错误。
 */
export async function assertBundleInputsOutsideOutdir(
  outdir: string,
  inputs: Iterable<string>,
) {
  for (const input of inputs) {
    assertInputOutsideOutdir(outdir, await resolvePath(input));
  }
}

/**
 * 读取配置、解析目录并校验工程约束。
 *
 * @param directory - 站点根目录，默认为当前目录。
 * @returns 解析后的站点工程信息。
 * @throws 缺少配置文件、目录不合法或内容目录不存在时抛出错误。
 */
export async function loadProject(directory = '.'): Promise<Project> {
  const root = await realpath(resolve(directory));
  const workDir = await resolvePath(join(root, '.phyllo'));
  const filename = join(root, 'phyllo.config.ts');

  if (!(await file(filename).exists())) {
    throw new Error(`Missing ${filename}. Run phyllo init first.`);
  }

  if (workDir === root || !isWithin(root, workDir)) {
    throw new Error('.phyllo must be a separate directory inside the project.');
  }
  await mkdir(workDir, { recursive: true });

  const {
    exports: { default: value },
    hash: configHash,
    inputs,
  } = await importFresh(filename);

  if (
    !value ||
    typeof value !== 'object' ||
    !('theme' in value) ||
    typeof value.theme !== 'string'
  ) {
    throw new Error(
      'phyllo.config.ts must export a config with a theme package name.',
    );
  }
  const resolved = resolveConfig(value as Config);
  const content = await resolvePath(resolve(root, resolved.content));
  const outdir = await resolvePath(resolve(root, resolved.outdir));

  if (
    content === root ||
    !isWithin(root, content) ||
    isWithin(workDir, content) ||
    isWithin(content, workDir)
  ) {
    throw new Error(
      'content must be a directory inside the project, outside .phyllo.',
    );
  }

  if (!(await stat(content).catch(() => undefined))?.isDirectory()) {
    throw new Error(`Content directory not found: ${content}`);
  }
  const protectedPaths = await Promise.all(
    ['public', 'node_modules', 'themes', '.git'].map(path =>
      resolvePath(join(root, path)),
    ),
  );

  if (
    outdir === root ||
    !isWithin(root, outdir) ||
    [content, workDir, ...protectedPaths].some(
      path => isWithin(outdir, path) || isWithin(path, outdir),
    )
  ) {
    throw new Error('outdir must be a separate directory inside the project.');
  }
  await assertBundleInputsOutsideOutdir(outdir, inputs);

  return {
    root,
    content,
    outdir,
    workDir,
    config: resolved,
    configHash,
    head: resolveHead(resolved.head),
  };
}
