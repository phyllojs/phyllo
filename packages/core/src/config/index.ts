import type { CompileOptions } from '@mdx-js/mdx';
import type { HeadConfig, HeadTag, SiteData } from 'phyllo';
import validate from 'validate-npm-package-name';

/** head 声明允许的标签。 */
const HEAD_TAGS = new Set<string>([
  'base',
  'meta',
  'link',
  'style',
  'script',
  'noscript',
]);

/**
 * 判断值是否为普通对象。
 *
 * @param value - 待判断的值。
 * @returns 值是对象且不是数组时为 `true`。
 */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 抛出配置字段类型错误。
 *
 * @param name - 字段名。
 * @param expected - 期望的类型描述。
 * @throws 始终抛出错误。
 */
function invalid(name: string, expected: string): never {
  throw new Error(`${name} must be ${expected}.`);
}

/**
 * 站点配置，来自 phyllo.config.ts。
 */
export interface Config extends SiteData {
  /** 主题包名，本地主题也通过工作区包安装。 */
  theme: string;
  /** 按配置顺序追加 head 标签，不与主题输出的标签合并或去重。 */
  head?: HeadConfig;
  /** 主题没有设置 HTML 语言标签时使用的缺省值。 */
  lang?: string;
  /** 页面地址之间的跳转映射。 */
  redirects?: Record<string, string>;
  /** 内容目录，相对于站点根目录。 */
  content?: string;
  /** 构建输出目录，相对于站点根目录。 */
  outdir?: string;
  markdown?: {
    /** 使用 Shiki 为 Markdown 代码块添加语法高亮，默认开启。 */
    highlight?: boolean;
    remarkPlugins?: NonNullable<CompileOptions['remarkPlugins']>;
    rehypePlugins?: NonNullable<CompileOptions['rehypePlugins']>;
  };
}

/**
 * 为配置提供编辑器提示，不做运行时处理。
 *
 * @param config - 站点配置。
 * @returns 原样返回的站点配置。
 */
export function defineConfig(config: Config): Config {
  return config;
}

/**
 * 补齐默认值后的站点配置。
 */
export interface ResolvedConfig extends Config {
  head: HeadConfig;
  redirects: Record<string, string>;
  search: boolean;
  content: string;
  outdir: string;
  markdown: {
    highlight: boolean;
    remarkPlugins: NonNullable<CompileOptions['remarkPlugins']>;
    rehypePlugins: NonNullable<CompileOptions['rehypePlugins']>;
  };
}

/**
 * 校验配置中类型系统无法表达的约束，并补齐缺省值。
 *
 * @param value - 用户配置。
 * @returns 补齐默认值后的配置。
 * @throws 语言标签不合法、主题不是包名或字段类型不正确时抛出错误。
 */
export function resolveConfig(value: Config): ResolvedConfig {
  if (value.lang !== undefined) {
    if (typeof value.lang !== 'string') {
      invalid('lang', 'a string');
    }

    try {
      new Intl.Locale(value.lang);
    } catch {
      throw new Error(`Invalid language tag: ${value.lang}.`);
    }
  }

  // 主题是已存在的包，允许 npm 历史包名；新包名的限制只在创建项目时使用。
  if (
    typeof value.theme !== 'string' ||
    !validate(value.theme).validForOldPackages
  ) {
    throw new Error(
      'theme must be a package name. Install local themes as workspace dependencies.',
    );
  }

  if (value.title !== undefined && typeof value.title !== 'string') {
    invalid('title', 'a string');
  }

  if (
    value.description !== undefined &&
    typeof value.description !== 'string'
  ) {
    invalid('description', 'a string');
  }

  if (value.head !== undefined && !isObject(value.head)) {
    invalid('head', 'an object');
  }

  if (value.redirects !== undefined && !isObject(value.redirects)) {
    invalid('redirects', 'an object');
  }

  for (const [from, to] of Object.entries(value.redirects ?? {})) {
    if (typeof to !== 'string') {
      invalid(`redirects[${JSON.stringify(from)}]`, 'a string');
    }
  }

  if (value.search !== undefined && typeof value.search !== 'boolean') {
    invalid('search', 'a boolean');
  }

  if (value.content !== undefined && typeof value.content !== 'string') {
    invalid('content', 'a string');
  }

  if (value.outdir !== undefined && typeof value.outdir !== 'string') {
    invalid('outdir', 'a string');
  }

  if (value.markdown !== undefined) {
    if (!isObject(value.markdown)) {
      invalid('markdown', 'an object');
    }

    if (
      value.markdown.highlight !== undefined &&
      typeof value.markdown.highlight !== 'boolean'
    ) {
      invalid('markdown.highlight', 'a boolean');
    }

    if (
      value.markdown.remarkPlugins !== undefined &&
      !Array.isArray(value.markdown.remarkPlugins)
    ) {
      invalid('markdown.remarkPlugins', 'an array');
    }

    if (
      value.markdown.rehypePlugins !== undefined &&
      !Array.isArray(value.markdown.rehypePlugins)
    ) {
      invalid('markdown.rehypePlugins', 'an array');
    }
  }

  return {
    ...value,
    head: value.head ?? {},
    redirects: value.redirects ?? {},
    search: value.search ?? false,
    content: value.content ?? 'content',
    outdir: value.outdir ?? 'dist',
    markdown: {
      highlight: value.markdown?.highlight ?? true,
      remarkPlugins: value.markdown?.remarkPlugins ?? [],
      rehypePlugins: value.markdown?.rehypePlugins ?? [],
    },
  };
}

/**
 * 把 head 声明转换成标签数组，保持声明顺序。
 *
 * @remarks
 * 属性名保持 React 的 JSX 写法，渲染端直接交给 React 处理。
 *
 * @param head - head 声明，省略时返回空数组。
 * @returns 按声明顺序排列的标签数组。
 * @throws 标签名、结构、属性值或内联内容不合法时抛出错误。
 */
export function resolveHead(head: Config['head']): HeadTag[] {
  if (head === undefined) {
    return [];
  }
  const tags: HeadTag[] = [];

  for (const [tag, value] of Object.entries(head)) {
    if (value === undefined) {
      continue;
    }

    if (!HEAD_TAGS.has(tag)) {
      throw new Error(`Unknown head tag: ${tag}.`);
    }
    const name = tag as HeadTag['tag'];

    if (name !== 'base' && !Array.isArray(value)) {
      throw new Error(`head.${name} must be an array.`);
    }
    const declarations = name === 'base' ? [value] : value;

    for (const declaration of declarations) {
      if (!isObject(declaration)) {
        throw new Error(`head.${name} entries must be objects.`);
      }
      const { textContent, innerHTML, ...attributes } = declaration;

      if (textContent !== undefined && typeof textContent !== 'string') {
        throw new Error(`head.${name} textContent must be a string.`);
      }

      if (innerHTML !== undefined && typeof innerHTML !== 'string') {
        throw new Error(`head.${name} innerHTML must be a string.`);
      }
      const attrs = normalizeAttributes(attributes);
      const content = textContent ?? innerHTML ?? '';

      // 已公开的必填字段：缺失时给出字段级错误，空字符串按现有约定保留。
      if (name === 'link' && typeof attrs.href !== 'string') {
        throw new Error('head.link entries must include a string href.');
      }

      if (name === 'style' && typeof textContent !== 'string') {
        throw new Error(
          'head.style entries must include a string textContent.',
        );
      }

      if (name === 'noscript' && typeof innerHTML !== 'string') {
        throw new Error(
          'head.noscript entries must include a string innerHTML.',
        );
      }

      if (
        (name === 'script' || name === 'style' || name === 'noscript') &&
        new RegExp(`</${name}[\\s/>]`, 'i').test(content)
      ) {
        throw new Error(
          `head.${name} content cannot contain a closing ${name} tag.`,
        );
      }
      tags.push({ tag: name, attrs, textContent, innerHTML });
    }
  }
  return tags;
}

/**
 * 过滤未设置的属性，保留 React 的属性名。
 *
 * @param attributes - 标签属性。
 * @returns 用于渲染的属性集合。
 * @throws 属性值不是字符串、数字或布尔值时抛出错误。
 */
function normalizeAttributes(
  attributes: Record<string, unknown>,
): HeadTag['attrs'] {
  const attrs: HeadTag['attrs'] = {};

  for (const [name, value] of Object.entries(attributes)) {
    if (value === undefined) {
      continue;
    }

    if (
      typeof value !== 'string' &&
      typeof value !== 'number' &&
      typeof value !== 'boolean'
    ) {
      throw new Error(
        `Head attribute ${name} must be a string, number or boolean.`,
      );
    }
    attrs[name] = value;
  }
  return attrs;
}
