import type { ContentDirectory } from '../index';

/**
 * 本地搜索选项。
 */
export interface SearchOptions {
  /** 只搜索该内容目录及其子目录，省略或空串时搜索全部内容。 */
  directory?: ContentDirectory;
  /** 搜索结果数量上限，默认为 20。 */
  limit?: number;
}

/**
 * 一条本地搜索结果。
 */
export interface SearchResult {
  /** 文档地址，包含章节锚点。 */
  url: string;
  /** 页面名称。 */
  title: string;
  /** 章节标题，页面级结果为空串。 */
  heading: string;
  /** 包含命中词的摘要。 */
  snippet: string;
  /** 需要高亮的词，以纯文本形式提供给主题。 */
  terms: string[];
}

/**
 * 本地搜索索引文档。
 */
export interface SearchDocument {
  /** 文档地址，包含章节锚点。 */
  url: string;
  /** 内容目录，从源文件相对路径得到，例如 zh/guide 或空串。 */
  directory: string;
  /** 页面名称。 */
  title: string;
  /** 章节标题，页面级文档为空串。 */
  heading: string;
  /** 用于检索与摘要的纯文本。 */
  text: string;
}

/**
 * 本地搜索索引的地址。
 */
export const searchIndexPath = '/_phyllo/search.json';
