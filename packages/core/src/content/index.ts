import { Glob } from 'bun';
import { lstat, realpath, stat } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';

import type { ContentPage, SearchDocument } from 'phyllo';

import type { Project } from '../config/project';

import { type CompiledContent, createCompiler } from './compile';
import { type ContentPaths, contentPaths, pageUrl } from './paths';

/**
 * 内容目录的索引结果。
 */
export interface ContentIndex {
  /** 全部内容页面。 */
  pages: ContentPage[];
  /** 页面地址与内容目录。 */
  paths: ContentPaths;
  /** 本地搜索索引文档。 */
  search: SearchDocument[];
}

/**
 * 单个内容文件编译失败的信息。
 */
export interface ContentFailure {
  /** 相对于内容目录的文件路径。 */
  file: string;
  /** 文件对应的页面地址。 */
  url: string;
  /** 原始错误。 */
  error: unknown;
}

/**
 * 内容文件编译失败的聚合错误，保留每个文件的错误信息。
 */
export class ContentCompileError extends AggregateError {
  /** 按文件记录的失败信息。 */
  public readonly failures: readonly ContentFailure[];

  /**
   * @param failures - 按文件记录的失败信息。
   */
  constructor(failures: readonly ContentFailure[]) {
    const [first] = failures;

    if (!first) {
      throw new Error('ContentCompileError requires at least one failure.');
    }
    super(
      failures.map(failure => failure.error),
      `Failed to compile ${first.file}: ${
        first.error instanceof Error ? first.error.message : String(first.error)
      }`,
    );
    this.failures = failures;
  }
}

/**
 * 多个文件指向同一页面地址的冲突。
 */
export interface RouteConflict {
  /** 冲突的页面地址。 */
  url: string;
  /** 指向该地址的文件，按输入顺序排列。 */
  files: string[];
}

/**
 * 内容路由冲突错误。
 */
export class ContentRouteError extends Error {
  /** 冲突列表。 */
  public readonly conflicts: readonly RouteConflict[];

  /**
   * @param conflicts - 内容路由冲突。
   */
  constructor(conflicts: readonly RouteConflict[]) {
    super(
      conflicts
        .map(
          conflict =>
            `Duplicate content route ${conflict.url}: ${conflict.files.join(' and ')}`,
        )
        .join('\n'),
    );
    this.conflicts = conflicts;
  }
}

/**
 * 收集指向同一页面地址的文件，保留输入顺序。
 *
 * @param entries - 页面地址与源文件路径。
 * @returns 只有多个文件指向同一地址的冲突项。
 */
export function findRouteConflicts(
  entries: ReadonlyArray<{ url: string; file: string }>,
): RouteConflict[] {
  const seen = new Map<string, RouteConflict>();

  for (const { url, file } of entries) {
    const conflict = seen.get(url);

    if (conflict) {
      conflict.files.push(file);
    } else {
      seen.set(url, { url, files: [file] });
    }
  }
  return [...seen.values()].filter(conflict => conflict.files.length > 1);
}

/**
 * 扫描文章文件，不编译内容；类型生成和目录索引共用。
 *
 * @param content - 内容目录的绝对路径。
 * @returns 相对于内容目录的文件路径，按字典序排列。
 */
export async function scanContent(content: string): Promise<string[]> {
  const scanned = await Array.fromAsync(
    new Glob('**/*.{md,mdx}').scan({ cwd: content, followSymlinks: true }),
  );
  const files: string[] = [];

  for (const file of scanned) {
    // 跟随目录符号链接，排除文件符号链接，避免同一文件产生重复路由。
    if ((await lstat(join(content, file))).isFile()) {
      files.push(file);
    }
  }
  return files.sort();
}

/**
 * 解析内容目录链接：真实目录到逻辑目录的映射。
 *
 * 打包器按真实位置解析模块，内容编译需要按 `content/` 下的逻辑路径生成页面地址与
 * 相对链接。映射枚举 `content/` 下的全部目录，链接根目录与未参与页面扫描的片段
 * 目录同样能还原逻辑位置。同一个真实目录只能通过一个链接路径出现，否则页面地址
 * 不唯一。
 *
 * @param project - 解析后的站点工程信息。
 * @returns 真实目录到逻辑目录（绝对）的映射。
 * @throws 同一真实目录出现在多个逻辑路径时抛出错误。
 */
export async function resolveContentDirectories(
  project: Project,
): Promise<Map<string, string>> {
  const directories = new Map<string, string>();

  /**
   * 登记真实目录的逻辑位置，同一真实目录出现多个逻辑路径时直接报错。
   *
   * @param realDir - 真实目录路径。
   * @param logicalDir - 逻辑目录路径。
   * @throws 同一真实目录对应多个逻辑路径时抛出错误。
   */
  function register(realDir: string, logicalDir: string) {
    const existing = directories.get(realDir);

    if (existing !== undefined && existing !== logicalDir) {
      const display = (path: string) => relative(project.content, path) || '.';

      throw new Error(
        `Content directory is reachable through multiple paths: ${display(existing)} and ${display(logicalDir)}. Remove one of the symbolic links.`,
      );
    }
    directories.set(realDir, logicalDir);
  }

  // 内容根目录不参与枚举，单独登记。
  register(project.content, project.content);

  /*
   * 枚举 content 下的目录（含物理目录、隐藏目录与目录链接）并登记映射：
   * 页面地址与片段、资源按逻辑路径解析，物理目录同时参与唯一性校验。
   * 文件链接与断链按页面扫描的既有语义跳过。
   */
  for await (const entry of new Glob('**/*').scan({
    cwd: project.content,
    dot: true,
    onlyFiles: false,
    followSymlinks: true,
  })) {
    const logical = join(project.content, entry);
    const stats = await lstat(logical);

    // 普通文件不参与目录登记。
    if (!stats.isDirectory() && !stats.isSymbolicLink()) {
      continue;
    }

    let real: string;

    try {
      real = await realpath(logical);
    } catch (error) {
      // 断链按扫描排除处理，其他文件系统错误继续抛出。
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        continue;
      }
      throw error;
    }

    if (!(await stat(logical)).isDirectory()) {
      continue;
    }
    register(real, logical);
  }
  return directories;
}

/**
 * 取内容模块的逻辑文件路径。
 *
 * 模块路径保持真实位置；内容模块按最近的已映射祖先目录换算逻辑路径，未参与页面
 * 扫描的子目录（如以 `.` 开头的片段目录）同样覆盖，主题文件保持原路径。
 *
 * @param path - 模块路径，可能带查询。
 * @param directories - 真实目录到逻辑目录的映射。
 * @returns 编译内容使用的逻辑文件路径。
 */
export function logicalContentFile(
  path: string,
  directories: ReadonlyMap<string, string>,
): string {
  const separator = path.indexOf('?');
  const file = separator < 0 ? path : path.slice(0, separator);

  let current = dirname(file);

  for (;;) {
    const logical = directories.get(current);

    if (logical !== undefined) {
      return join(logical, relative(current, file));
    }
    const parent = dirname(current);

    if (parent === current) {
      return file;
    }
    current = parent;
  }
}

/**
 * 编译内容目录中的全部文件，生成页面、类型路径和搜索索引。
 *
 * @param project - 解析后的站点工程信息。
 * @param compile - 内容编译器，默认使用当前工程创建。
 * @param scanned - 已扫描的内容文件路径，省略时重新扫描。
 * @returns 内容目录的索引结果。
 * @throws 存在编译失败时抛出 `ContentCompileError`，存在路由冲突时抛出 `ContentRouteError`。
 */
export async function indexContent(
  project: Project,
  compile = createCompiler(project),
  scanned?: readonly string[],
): Promise<ContentIndex> {
  const files = scanned ?? (await scanContent(project.content));
  const failures: ContentFailure[] = [];
  const compiled: Array<{ file: string; result: CompiledContent }> = [];

  for (const file of files) {
    try {
      compiled.push({
        file,
        // 按内容目录下的逻辑路径编译，符号链接目录的路由与产物路径保持在 content 内。
        result: await compile(join(project.content, file)),
      });
    } catch (error) {
      failures.push({ file, url: pageUrl(file), error });
    }
  }

  if (failures.length) {
    throw new ContentCompileError(failures);
  }
  const conflicts = findRouteConflicts(
    compiled.map(({ file, result }) => ({ url: result.page.url, file })),
  );

  if (conflicts.length) {
    throw new ContentRouteError(conflicts);
  }
  const index: ContentIndex = {
    pages: [],
    paths: contentPaths(files),
    search: [],
  };

  for (const { result } of compiled) {
    index.pages.push(result.page);
    index.search.push(...result.search);
  }
  return index;
}
