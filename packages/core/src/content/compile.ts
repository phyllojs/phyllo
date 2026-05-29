import { file, hash, YAML } from 'bun';
import { basename, dirname, extname, relative, resolve, sep } from 'node:path';

import { compile } from '@mdx-js/mdx';
import type { Nodes, Root } from 'mdast';
import type { ContentPage, Frontmatter, SearchDocument } from 'phyllo';
import rehypeRaw from 'rehype-raw';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkMdxFrontmatter from 'remark-mdx-frontmatter';

import { type Project, assertInputOutsideOutdir } from '../config/project';
import { resolvePath } from '../utils/fs';
import { isWithin } from '../utils/path';

import { rehypeHighlight } from './highlight';
import { pageUrl } from './paths';

/**
 * 判断语法树中是否存在正文内容。
 *
 * @param node - 语法树节点。
 * @returns 节点包含正文时为 `true`。
 */
function hasContent(node: Nodes): boolean {
  if (
    node.type === 'yaml' ||
    node.type === 'mdxjsEsm' ||
    node.type === 'definition'
  ) {
    return false;
  }

  if (node.type === 'mdxFlowExpression' || node.type === 'mdxTextExpression') {
    return !!node.data?.estree?.body.length;
  }

  if (node.type === 'html') {
    return !!node.value.replace(/<!--[\s\S]*?-->/g, '').trim();
  }

  if (node.type === 'text') {
    return !!node.value.trim();
  }

  if (node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement') {
    return true;
  }
  return 'children' in node ? node.children.some(hasContent) : true;
}

/**
 * 拼接语法树节点的纯文本。
 *
 * @param node - 语法树节点。
 * @returns 节点及其子节点的文本内容。
 */
function textContent(node: Nodes): string {
  if ('value' in node) {
    return node.value;
  }
  return 'children' in node ? node.children.map(textContent).join('') : '';
}

/**
 * 搜索段落。
 */
interface SearchSection {
  /** 段落地址，标题段带锚点。 */
  url: string;
  /** 段落标题，页面段为空串。 */
  heading: string;
  /** 段落文本。 */
  text: string;
}

/**
 * 生成不与已有锚点重复的标题锚点。
 *
 * @param base - 由标题文本生成的锚点。
 * @param used - 当前页面已使用的锚点。
 * @returns 可用的锚点。
 */
function uniqueAnchor(base: string, used: Set<string>): string {
  if (!used.has(base)) {
    return base;
  }

  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base}-${suffix}`;

    if (!used.has(candidate)) {
      return candidate;
    }
  }
}

/**
 * 解码内容链接中的路径。
 *
 * @param value - 链接中未经解码的路径。
 * @returns 解码后的路径，编码不合法时为 `undefined`。
 */
function decodeLink(value: string): string | undefined {
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
}

/**
 * 把语法树切分为搜索段落，并为标题分配锚点。
 *
 * @param tree - Markdown 语法树。
 * @param url - 页面地址，用于生成带锚点的段落地址。
 * @returns 页面级与各标题级的搜索段落。
 * @throws 同一页面出现重复锚点时抛出错误。
 */
function searchSections(tree: Root, url: string): SearchSection[] {
  const initial: SearchSection = { url, heading: '', text: '' };
  const sections: SearchSection[] = [initial];
  const used = new Set<string>();
  // 当前写入的搜索段落，遇到标题时切换。
  const cursor = { section: initial };

  function reserve(node: Nodes) {
    if (node.type === 'heading') {
      const [last] = node.children.toReversed();

      if (last?.type === 'text') {
        const match = /\s+\{#(?<id>[^\s{}]+)\}\s*$/.exec(last.value);
        const id = match?.groups?.['id'];

        if (match && id !== undefined) {
          last.value = last.value.slice(0, match.index);
          node.data ??= {};
          node.data.hProperties = { ...node.data.hProperties, id };
        }
      }
    }
    const id = node.data?.hProperties?.id;

    if (typeof id === 'string') {
      if (used.has(id)) {
        throw new Error(`Duplicate anchor #${id} in ${url}`);
      }
      used.add(id);
    }

    if (
      node.type === 'mdxJsxFlowElement' ||
      node.type === 'mdxJsxTextElement'
    ) {
      for (const attribute of node.attributes) {
        if (
          attribute.type === 'mdxJsxAttribute' &&
          attribute.name === 'id' &&
          typeof attribute.value === 'string'
        ) {
          if (used.has(attribute.value)) {
            throw new Error(`Duplicate anchor #${attribute.value} in ${url}`);
          }
          used.add(attribute.value);
        }
      }
    }

    if ('children' in node) {
      node.children.forEach(reserve);
    }
  }

  function visit(node: Nodes) {
    if (node.type === 'heading') {
      const heading = textContent(node).trim();
      const explicitId = node.data?.hProperties?.id;
      const id =
        typeof explicitId === 'string'
          ? explicitId
          : uniqueAnchor(
              heading
                .toLowerCase()
                .replace(/[^\p{L}\p{N}]+/gu, '-')
                .replace(/^-|-$/g, '') || 'section',
              used,
            );

      if (typeof explicitId !== 'string') {
        used.add(id);
        node.data ??= {};
        node.data.hProperties = { ...node.data.hProperties, id };
      }

      if (node.depth === 1) {
        return;
      }
      const next = {
        url: `${url}#${encodeURIComponent(id)}`,
        heading,
        text: '',
      };

      cursor.section = next;
      sections.push(next);

      return;
    }

    if (
      node.type === 'text' ||
      node.type === 'inlineCode' ||
      node.type === 'code'
    ) {
      cursor.section.text += `${node.value} `;
    } else if ('children' in node) {
      node.children.forEach(visit);
    }
  }

  reserve(tree);
  visit(tree);

  return sections.map(section => ({
    ...section,
    text: section.text.replace(/\s+/g, ' ').trim(),
  }));
}

/**
 * 深度优先遍历语法树。
 *
 * @param node - 当前节点。
 * @param visit - 每个节点执行的回调。
 */
async function walk(
  node: Nodes,
  visit: (node: Nodes) => Promise<void>,
): Promise<void> {
  await visit(node);

  if ('children' in node) {
    for (const child of node.children) {
      await walk(child, visit);
    }
  }
}

/**
 * 单个内容文件的编译结果。
 */
export interface CompiledContent {
  /** 页面信息。 */
  page: ContentPage;
  /** 编译后的 ESM 代码。 */
  code: string;
  /** 引用到的静态资源，键为输出路径。 */
  assets: Map<string, Blob>;
  /** 本地搜索索引文档。 */
  search: SearchDocument[];
}

/**
 * 编译过程中收集到的页面信息。
 */
interface ContentAnalysis {
  /** 页面 frontmatter。 */
  frontmatter: Frontmatter;
  /** 正文的第一个一级标题。 */
  heading: string;
  /** 页面是否包含正文。 */
  hasContent: boolean;
  /** 搜索段落。 */
  sections: SearchSection[];
}

/**
 * 根据配置创建编译器，内容索引和 Bun 热更新共用这个实例。
 *
 * @param project - 解析后的站点工程信息。
 * @returns 按文件路径编译内容的函数，源文件和引用的资源都不变时复用上次结果。
 */
export function createCompiler(project: Project) {
  const cache = new Map<
    string,
    {
      source: string;
      dependencies: Map<string, string>;
      result: Promise<CompiledContent>;
    }
  >();
  const compiler = async (filename: string): Promise<CompiledContent> => {
    const source = await file(filename).text();

    assertInputOutsideOutdir(project.outdir, await resolvePath(filename));

    const previous = cache.get(filename);

    if (
      previous?.source === source &&
      !(await dependenciesChanged(project, previous.dependencies))
    ) {
      return previous.result;
    }
    const dependencies = new Map<string, string>();
    const result = compileContent(project, filename, source, dependencies);

    cache.set(filename, { source, dependencies, result });

    try {
      return await result;
    } catch (error) {
      if (cache.get(filename)?.result === result) {
        cache.delete(filename);
      }
      throw error;
    }
  };

  return compiler;
}

/**
 * 判断缓存记录的资源引用是否发生变化。
 *
 * 资源记录保存引用的逻辑路径；检查时重新解析当前真实目标，符号链接改指向后
 * 按新目标判断内容并执行输出目录校验，目标缺失或内容变化时重新编译。
 *
 * @param project - 解析后的站点工程信息。
 * @param dependencies - 资源引用路径到内容哈希的映射。
 * @returns 任一资源缺失或内容变化时为 `true`。
 * @throws 资源当前目标位于输出目录内时抛出错误。
 */
async function dependenciesChanged(
  project: Project,
  dependencies: Map<string, string>,
) {
  for (const [source, digest] of dependencies) {
    const asset = file(source);

    if (!(await asset.exists())) {
      return true;
    }
    assertInputOutsideOutdir(project.outdir, await resolvePath(source));

    if (hash(await asset.arrayBuffer()).toString(16) !== digest) {
      return true;
    }
  }
  return false;
}

/**
 * 编译内容文件，并把引用到的静态资源写入构建产物。
 *
 * @param filename - 内容文件的绝对路径。
 * @param compile - 内容编译器。
 * @param files - 收集构建产物的映射。
 * @returns 编译结果。
 */
export async function loadContent(
  filename: string,
  compile: ReturnType<typeof createCompiler>,
  files: Map<string, Blob | string>,
): Promise<CompiledContent> {
  const result = await compile(filename);

  for (const [path, asset] of result.assets) {
    files.set(path, asset);
  }
  return result;
}

/**
 * 编译单个内容文件，生成页面信息、ESM 代码、静态资源和搜索文档。
 *
 * @param project - 解析后的站点工程信息。
 * @param filename - 内容文件的绝对路径。
 * @param source - 文件内容。
 * @param dependencies - 收集引用资源的内容哈希，用于缓存失效判断。
 * @returns 编译结果。
 * @throws frontmatter 不合法、锚点重复或内容链接无效时抛出错误。
 */
export async function compileContent(
  project: Project,
  filename: string,
  source: string,
  dependencies: Map<string, string> = new Map(),
): Promise<CompiledContent> {
  const { content, config } = project;
  const filePath = relative(content, filename).split(sep).join('/');
  const url = pageUrl(filePath);
  const assets = new Map<string, Blob>();
  const analysis: ContentAnalysis = {
    frontmatter: {},
    heading: '',
    hasContent: false,
    sections: [],
  };

  function analyze() {
    return async (tree: Root) => {
      analysis.hasContent = hasContent(tree);
      analysis.sections = searchSections(tree, url);

      await walk(tree, async node => {
        if (node.type === 'yaml') {
          const value: unknown = YAML.parse(node.value);

          if (
            value !== null &&
            (typeof value !== 'object' || Array.isArray(value))
          ) {
            throw new Error(`Frontmatter must be an object: ${filePath}`);
          }
          analysis.frontmatter = (value ?? {}) as Frontmatter;
        }

        if (node.type === 'heading' && node.depth === 1 && !analysis.heading) {
          analysis.heading = textContent(node);
        }

        if (
          node.type !== 'link' &&
          node.type !== 'image' &&
          node.type !== 'definition'
        ) {
          return;
        }

        if (!node.url || /^(?:[a-z][a-z\d+.-]*:|[/#?])/i.test(node.url)) {
          return;
        }
        const split = node.url.search(/[?#]/);
        const path = split < 0 ? node.url : node.url.slice(0, split);
        const suffix = split < 0 ? '' : node.url.slice(split);
        const decoded = decodeLink(path);

        if (decoded === undefined) {
          throw new Error(`Invalid content link: ${filePath}: ${node.url}`);
        }
        const source = resolve(dirname(filename), decoded);

        if (!isWithin(content, source)) {
          throw new Error(
            `Content link escapes the content directory: ${filePath}: ${node.url}`,
          );
        }

        if (/\.mdx?$/.test(source)) {
          node.url =
            pageUrl(relative(content, source).split(sep).join('/')) + suffix;
        } else {
          const real = await resolvePath(source);
          const asset = file(source);

          if (!(await asset.exists())) {
            // 记录引用的逻辑路径，符号链接目标变化或恢复后可以重新编译。
            dependencies.set(source, '');

            throw new Error(`Cannot find asset: ${filePath}: ${node.url}`);
          }
          assertInputOutsideOutdir(project.outdir, real);

          const bytes = await asset.arrayBuffer();
          const digest = hash(bytes).toString(16);
          const target = `_phyllo/media/${digest}${extname(source)}`;

          dependencies.set(source, digest);
          assets.set(target, new Blob([bytes], { type: asset.type }));
          node.url = `/${target}${suffix}`;
        }
      });
    };
  }

  const format = extname(filename) === '.md' ? 'md' : 'mdx';
  // 仅对 MDX 导出 frontmatter；与页面数据共用解析器，空块归一化为空对象。
  const frontmatterPlugins: Array<
    [typeof remarkMdxFrontmatter, Parameters<typeof remarkMdxFrontmatter>[0]]
  > =
    format === 'mdx'
      ? [
          [
            remarkMdxFrontmatter,
            {
              default: {},
              parsers: {
                yaml: (value: string) => YAML.parse(value) ?? {},
              },
            },
          ],
        ]
      : [];
  const result = await compile(
    { path: filename, value: source },
    {
      format,
      jsx: true,
      jsxImportSource: 'react',
      remarkPlugins: [
        remarkFrontmatter,
        remarkGfm,
        ...config.markdown.remarkPlugins,
        ...frontmatterPlugins,
        analyze,
      ],
      rehypePlugins: [
        // Markdown 的 HTML 块需要先解析成 HAST，mdx 模式下 HTML 本身就是 JSX。
        ...(format === 'md' ? [rehypeRaw] : []),
        ...(config.markdown.highlight ? [rehypeHighlight] : []),
        ...config.markdown.rehypePlugins,
      ],
    },
  );

  const code = String(result);

  for (const key of ['title', 'description'] as const) {
    if (
      analysis.frontmatter[key] !== undefined &&
      typeof analysis.frontmatter[key] !== 'string'
    ) {
      throw new Error(`Frontmatter ${key} must be a string: ${filePath}`);
    }
  }
  const name = basename(filePath, extname(filePath));
  const title =
    typeof analysis.frontmatter.title === 'string'
      ? analysis.frontmatter.title
      : analysis.heading || (name === 'index' ? (config.title ?? name) : name);
  const page: ContentPage = {
    url,
    filePath,
    title,
    description: analysis.frontmatter.description as string | undefined,
    frontmatter: analysis.frontmatter,
    hasContent: analysis.hasContent,
  };
  const separator = filePath.lastIndexOf('/');
  const directory = separator < 0 ? '' : filePath.slice(0, separator);
  const search =
    config.search && analysis.hasContent
      ? analysis.sections.map(section => ({
          ...section,
          title,
          directory,
          text: section.heading
            ? section.text
            : [analysis.frontmatter.description, section.text]
                .filter(Boolean)
                .join(' '),
        }))
      : [];

  return {
    page,
    code,
    assets,
    search,
  };
}
