import {
  type BuildConfig,
  type BuildMetafile,
  build as bundle,
  file,
  Glob,
  hash,
  resolveSync,
  write,
} from 'bun';
import { existsSync, realpathSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';

import { type PageData, type Resources, searchIndexPath } from 'phyllo';

import type { ResolvedConfig } from '../config';
import {
  type Project,
  assertBundleInputsOutsideOutdir,
  loadProject,
} from '../config/project';
import {
  indexContent,
  resolveContentDirectories,
  scanContent,
} from '../content';
import { createCompiler } from '../content/compile';
import { writeTypes } from '../content/types';
import { resolveRedirects } from '../routing/redirects';
import { resolveRoutes } from '../routing/routes';
import type { RenderRuntime } from '../runtime';
import { writeIfChanged } from '../utils/fs';
import { importBundle } from '../utils/module';
import { findPackageRoot, isWithin } from '../utils/path';

import { createEntrySources } from './entries';
import { contentPlugin } from './plugin';

/**
 * 静态构建的结果。
 */
export interface BuildResult {
  /** 输出目录的绝对路径。 */
  outdir: string;
  /** 生成的页面数量，不包含跳转页。 */
  pages: number;
  /** 写入的全部文件路径，相对于输出目录。 */
  files: string[];
}

/**
 * 一次站点构建的内存结果，构建与开发服务器共用。
 */
export interface SiteBuild {
  /** 解析后的站点工程信息。 */
  project: Project;
  /** 待写入或由开发服务器提供的文件。 */
  files: Map<string, Blob | string>;
  /** 页面 URL 到输出文件名的映射。 */
  routes: Map<string, string>;
  /** 尾斜杠和 index.html 形式的别名，指向无尾斜杠的规范路径。 */
  aliases: Map<string, string>;
  /** 来源地址到最终目标地址的映射。 */
  redirects: Map<string, string>;
  /** 真实目录到内容逻辑目录的映射。 */
  directories: ReadonlyMap<string, string>;
  /** 渲染单个页面为完整 HTML。 */
  render: (url: string, resources: Resources) => Promise<string>;
  /** 内容编译器。 */
  compile: ReturnType<typeof createCompiler>;
  /** 主题包入口所在目录，用于开发服务监听主题源码。 */
  themeRoot: string;
}

/**
 * 内容范围解析结果：已解析的工程信息与内容目录映射。
 */
export interface ContentRange {
  /** 已解析的站点工程信息。 */
  project: Project;
  /** 真实目录到内容逻辑目录的映射。 */
  directories: ReadonlyMap<string, string>;
}

/**
 * 站点构建选项。
 */
export interface BuildOptions {
  /** 生成开发模式入口，跳过浏览器打包与页面渲染。 */
  development?: boolean;
  /** 复用上次构建的编译结果。 */
  previous?: SiteBuild;
  /**
   * 工程信息与内容目录映射解析完成、内容编译开始前的回调。
   *
   * 开发监听用它在本轮构建失败时仍能保持最新的内容范围。
   */
  onContentRange?: (range: ContentRange) => void;
}

/**
 * 计算配置值的可比较签名。
 *
 * 插件函数无法可靠比较：配置包含插件时返回 `undefined`，调用方重新创建编译器。
 *
 * @param config - 补齐默认值后的站点配置。
 * @returns 配置值签名，无法确认等价时为 `undefined`。
 */
function configSignature(config: ResolvedConfig): string | undefined {
  const { markdown, ...rest } = config;
  const { remarkPlugins, rehypePlugins, ...options } = markdown;

  if (remarkPlugins.length > 0 || rehypePlugins.length > 0) {
    return undefined;
  }
  return JSON.stringify({ ...rest, markdown: options });
}

/**
 * 把打包元数据的输入路径转换为绝对路径。
 *
 * 元数据键以打包时的工作目录为基准；用户代码可能在打包与校验之间改变工作目录，
 * 因此必须在打包返回后立即转换。
 *
 * @param metafile - 打包元数据。
 * @returns 输入文件的绝对路径列表。
 */
function bundleInputPaths(metafile: BuildMetafile | undefined) {
  return Object.keys(metafile?.inputs ?? {}).map(input =>
    isAbsolute(input) ? input : resolve(input),
  );
}

/**
 * 判断能否复用编译器：工程身份、配置代码与配置值都未变化。
 *
 * 配置模块代码哈希无法反映运行时读取的外部文件，复用还需要比较本轮解析出的
 * 配置值；插件函数无法可靠比较时重新创建编译器。
 *
 * @param previous - 上一次构建的工程信息。
 * @param project - 本次构建的工程信息。
 * @returns 可以复用时为 `true`。
 */
function canReuseCompiler(previous: Project, project: Project) {
  if (
    previous.root !== project.root ||
    previous.content !== project.content ||
    previous.outdir !== project.outdir ||
    previous.configHash !== project.configHash
  ) {
    return false;
  }
  const signature = configSignature(previous.config);

  return (
    signature !== undefined && signature === configSignature(project.config)
  );
}

/**
 * 解析主题包入口，缺少时给出安装提示。
 *
 * @param project - 解析后的站点工程信息。
 * @returns 主题入口的绝对路径。
 * @throws 主题无法解析时抛出错误。
 */
function resolveTheme(project: Project): string {
  try {
    return resolveSync(project.config.theme, project.root);
  } catch {
    throw new Error(
      `Cannot resolve theme "${project.config.theme}". Install it in the site's package.json.`,
    );
  }
}

/**
 * 编译内容、打包主题并生成待写入的站点构建结果。
 *
 * @param directory - 站点根目录，默认为当前目录。
 * @param options - 构建选项。
 * @returns 站点构建结果。
 * @throws 主题无法解析、内容编译失败或代码构建失败时抛出错误。
 */
export async function createBuild(
  directory = '.',
  options: BuildOptions = {},
): Promise<SiteBuild> {
  const { development = false, previous } = options;
  const project = await loadProject(directory);
  const theme = realpathSync(resolveTheme(project));
  const themeRoot = findPackageRoot(dirname(theme));

  // 站点内的独立主题包与输出目录重叠时，清理输出会删除主题源码。
  if (isWithin(project.outdir, theme)) {
    throw new Error('outdir must not contain the theme source.');
  }

  if (
    themeRoot !== project.root &&
    isWithin(project.root, themeRoot) &&
    (isWithin(project.outdir, themeRoot) || isWithin(themeRoot, project.outdir))
  ) {
    throw new Error('outdir must not overlap the theme package.');
  }
  const entryDir = join(project.workDir, development ? 'dev' : 'build');
  const compile =
    previous !== undefined && canReuseCompiler(previous.project, project)
      ? previous.compile
      : createCompiler(project);
  const scanned = await scanContent(project.content);
  const directories = await resolveContentDirectories(project);

  // 输出目录与真实内容来源重叠时，清理输出会删除内容源文件。
  for (const realDir of directories.keys()) {
    if (
      isWithin(project.outdir, realDir) ||
      isWithin(realDir, project.outdir)
    ) {
      throw new Error('outdir must not overlap content sources.');
    }
  }

  options.onContentRange?.({ project, directories });

  const index = await indexContent(project, compile, scanned);
  const redirects = resolveRedirects(
    project.config.redirects,
    new Set(index.pages.map(page => page.url)),
  );
  const { routes, aliases } = resolveRoutes(
    index.pages.map(page => page.url),
    redirects.keys(),
  );

  await writeTypes(project, index.paths);

  const quote = JSON.stringify;
  const home: PageData | undefined =
    !redirects.has('/') && !index.pages.some(page => page.url === '/')
      ? {
          url: '/',
          title: '',
          frontmatter: {},
          hasContent: false,
        }
      : undefined;
  const site = {
    title: project.config.title,
    description: project.config.description,
    lang: project.config.lang,
    search: project.config.search,
  };
  const configVersion = hash(JSON.stringify(project.head)).toString(16);
  const { app, client, server } = await createEntrySources({
    // 主题包说明符交给打包器按目标解析；真实路径用于输入保护、包目录定位与监听。
    theme: project.config.theme,
    site,
    pages: index.pages,
    home,
    content: project.content,
    configVersion,
    development,
  });

  await Promise.all([
    writeIfChanged(join(entryDir, 'app.ts'), app),
    writeIfChanged(join(entryDir, 'client.ts'), client),
    writeIfChanged(join(entryDir, 'server.ts'), server),
  ]);

  const buildOptions: Partial<BuildConfig> = {
    format: 'esm',
    jsx: { runtime: 'automatic', importSource: 'react' },
    metafile: true,
    publicPath: '/_phyllo/',
    naming: '[name]-[hash].[ext]',
    define: {
      'process.env.NODE_ENV': quote(development ? 'development' : 'production'),
    },
  };
  const files = new Map<string, Blob | string>();
  const browserBundle = development
    ? undefined
    : await bundle({
        ...buildOptions,
        entrypoints: [join(entryDir, 'client.ts')],
        target: 'browser',
        splitting: true,
        minify: true,
        plugins: [contentPlugin({ project, compile, files, directories })],
      });

  if (browserBundle && !browserBundle.success) {
    throw new AggregateError(
      browserBundle.logs,
      'Failed to build the theme and browser code.',
    );
  }

  if (browserBundle) {
    const inputs = bundleInputPaths(browserBundle.metafile);

    await assertBundleInputsOutsideOutdir(project.outdir, inputs);
  }

  if (project.config.search) {
    files.set(
      searchIndexPath.slice(1),
      new Blob(
        [
          JSON.stringify(
            index.search.filter(document => {
              const [page] = document.url.split('#');

              return !redirects.has(page!);
            }),
          ),
        ],
        {
          type: 'application/json; charset=utf-8',
        },
      ),
    );
  }
  const resources: Resources = { styles: [], scripts: [], head: project.head };

  for (const output of browserBundle?.outputs ?? []) {
    const path = `_phyllo/${basename(output.path)}`;

    files.set(path, output);

    if (output.path.endsWith('.css')) {
      resources.styles.push(`/${path}`);
    } else if (output.kind === 'entry-point' && output.path.endsWith('.js')) {
      resources.scripts.push(`/${path}`);
    }
  }
  const serverBundle = await bundle({
    ...buildOptions,
    entrypoints: [join(entryDir, 'server.ts')],
    target: 'bun',
    plugins: [
      contentPlugin({ project, compile, files, directories, server: true }),
    ],
  });

  if (!serverBundle.success) {
    throw new AggregateError(
      serverBundle.logs,
      'Failed to build static rendering code.',
    );
  }
  await assertBundleInputsOutsideOutdir(
    project.outdir,
    bundleInputPaths(serverBundle.metafile),
  );

  for (const output of serverBundle.outputs) {
    if (output.kind === 'asset') {
      files.set(`_phyllo/${basename(output.path)}`, output);
    }
  }
  const serverEntry = serverBundle.outputs.find(
    output => output.kind === 'entry-point',
  );

  if (!serverEntry) {
    throw new Error('Static rendering code did not produce an entry point.');
  }
  const { render, renderRedirect } =
    await importBundle<RenderRuntime>(serverEntry);

  if (!development) {
    for (const [url, filename] of routes) {
      const destination = redirects.get(url);

      if (destination !== undefined) {
        files.set(filename, renderRedirect(destination));

        continue;
      }
      files.set(filename, await render(url, resources));
    }
  }
  const publicDir = join(project.root, 'public');

  if (existsSync(publicDir)) {
    for await (const path of new Glob('**/*').scan({
      cwd: publicDir,
      dot: true,
      onlyFiles: true,
      throwErrorOnBrokenSymlink: true,
    })) {
      if (path.startsWith('_phyllo/') || files.has(path)) {
        throw new Error(`Public file conflicts with a generated file: ${path}`);
      }
      const source = file(join(publicDir, path));

      files.set(path, source);
    }
  }
  return {
    project,
    files,
    routes,
    aliases,
    redirects,
    render,
    compile,
    directories,
    themeRoot,
  };
}

/**
 * 校验全部产物路径位于输出目录内，防止越界写入。
 *
 * @param paths - 相对于输出目录的产物路径。
 * @param outdir - 输出目录的绝对路径。
 * @throws 任一目标越出输出目录时抛出错误。
 */
export function assertOutputPaths(paths: Iterable<string>, outdir: string) {
  const targets = [...paths];
  const files = new Set(targets);

  for (const path of targets) {
    const target = join(outdir, path);

    if (!isWithin(outdir, target)) {
      throw new Error(`Output file escapes the output directory: ${path}`);
    }

    // 文件与目录前缀冲突：一个产物同时是另一个产物的父目录。
    for (let current = path; ;) {
      const separator = current.lastIndexOf('/');

      if (separator < 0) {
        break;
      }
      current = current.slice(0, separator);

      if (files.has(current)) {
        throw new Error(`Output paths conflict: ${current} and ${path}`);
      }
    }
  }
}

/**
 * 按实际文件系统规则校验产物路径冲突。
 *
 * 在输出目录所在文件系统创建临时校验目录，按最终产物路径创建目录与排他占位文件：
 * 不区分大小写或归一化规则导致的冲突在此暴露，清理输出目录之前即可报错。
 *
 * @param paths - 最终产物路径。
 * @param outdir - 输出目录的绝对路径。
 * @throws 文件系统将多个产物视为同一路径时抛出错误。
 */
export async function assertOutputFilesystem(
  paths: Iterable<string>,
  outdir: string,
) {
  await mkdir(outdir, { recursive: true });

  // 唯一临时目录只属于本次校验，失败时不影响输出目录中的已有产物。
  const probe = await mkdtemp(join(outdir, '.phyllo-output-check-'));

  try {
    for (const path of paths) {
      const target = join(probe, path);

      try {
        await mkdir(dirname(target), { recursive: true });
        // 排他创建：文件系统视为同一路径时失败。
        await writeFile(target, '', { flag: 'wx' });
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;

        if (code === 'EEXIST' || code === 'ENOTDIR') {
          throw new Error(`Output paths conflict on this filesystem: ${path}`, {
            cause: error,
          });
        }
        throw error;
      }
    }
  } finally {
    await rm(probe, { recursive: true, force: true });
  }
}

/**
 * 构建静态站点并写入输出目录。
 *
 * @param directory - 站点根目录，默认为当前目录。
 * @returns 静态构建的结果。
 */
export async function build(directory = '.'): Promise<BuildResult> {
  const result = await createBuild(directory);
  const outdir = result.project.outdir;
  const paths = [...result.files.keys()];

  // 先校验全部目标，失败时不清理已有的输出目录。
  assertOutputPaths(paths, outdir);
  await assertOutputFilesystem(paths, outdir);

  // 与 Vite 的 emptyOutDir 行为一致：先清空输出目录，再原地写入。
  await rm(outdir, { recursive: true, force: true });

  for (const [path, content] of result.files) {
    const target = join(outdir, path);

    if (existsSync(target)) {
      throw new Error(`Output file conflicts on this filesystem: ${path}`);
    }
    await write(target, content);
  }

  return {
    outdir,
    // 重定向来源只生成跳转页，不计入页面数。
    pages: result.routes.size - result.redirects.size,
    files: [...result.files.keys()],
  };
}
