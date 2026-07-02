export { useFrontmatter, usePage, usePages, useSite } from './hooks';
export { useSearch } from './search/query';
export type { ContentPage, Frontmatter, PageData, SiteData } from './data';
export { HeadResources } from './render/document';
export type { Resources } from './render/document';
export type { HeadConfig, HeadTag } from './head';
export { searchIndexPath } from './search/types';
export type {
  SearchDocument,
  SearchOptions,
  SearchResult,
} from './search/types';

/**
 * 站点生成的 .phyllo/types.d.ts 会把文章地址添加到此接口。
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- 由生成的声明填充
export interface ContentPages {}

/**
 * 未生成声明时退回 string，保证首次同步前也能正常使用。
 */
export type ContentPageUrl = [keyof ContentPages] extends [never]
  ? string
  : keyof ContentPages;

/**
 * 站点生成的 .phyllo/types.d.ts 会把内容目录添加到此接口。
 */
export interface ContentDirectories {
  '': true;
}

/**
 * 搜索可以限定的内容目录。
 */
export type ContentDirectory = keyof ContentDirectories | (string & {});
