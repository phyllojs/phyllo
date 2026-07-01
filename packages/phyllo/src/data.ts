/**
 * 站点与页面的数据类型。
 *
 * 这个模块不依赖任何 UI 框架，供生成的类型声明和数据类型使用者引用。
 */

/**
 * 站点级信息，来自 phyllo.config.ts。
 */
export interface SiteData {
  /** 站点名称。 */
  title?: string;
  /** 站点默认描述。 */
  description?: string;
  /** 主题没有设置 HTML 语言标签时的缺省值，来自 config.lang。 */
  lang?: string;
  /** 是否生成本地搜索索引，来自 config.search。 */
  search?: boolean;
}

/**
 * 页面 frontmatter，字段由主题解释。
 */
export type Frontmatter = Record<string, unknown>;

/**
 * 当前渲染页面的信息。
 */
export interface PageData {
  /** 页面地址。 */
  url: string;
  /** 页面名称。 */
  title: string;
  /** 页面描述，来自 frontmatter。 */
  description?: string;
  /** 源文件路径，主题渲染的虚拟首页没有源文件。 */
  filePath?: string;
  /** 原始 frontmatter。 */
  frontmatter: Frontmatter;
  /** 页面是否包含正文。 */
  hasContent: boolean;
}

/**
 * 内容文件生成的页面。
 *
 * @typeParam Url - 页面地址类型，生成声明后收窄为已知地址。
 */
export interface ContentPage<Url extends string = string> extends PageData {
  url: Url;
  filePath: string;
}
