import type { JSX } from 'react';

type HeadAttributes<Tag extends keyof JSX.IntrinsicElements> = {
  [
    Key in keyof JSX.IntrinsicElements[Tag] as Key extends
      'children' | 'key' | 'ref' | 'dangerouslySetInnerHTML' | `on${string}`
      ? never
      : Key
  ]: Extract<
    JSX.IntrinsicElements[Tag][Key],
    string | number | boolean | undefined
  >;
};

/**
 * 站点配置中的 head 声明。
 */
export interface HeadConfig {
  /** 单个 base 标签。 */
  base?: HeadAttributes<'base'>;
  /** meta 标签数组。 */
  meta?: HeadAttributes<'meta'>[];
  /** link 标签数组，每项必须提供 href。 */
  link?: (HeadAttributes<'link'> & { href: string })[];
  /** style 标签数组，每项通过 textContent 提供 CSS。 */
  style?: (HeadAttributes<'style'> & { textContent: string })[];
  /** script 标签数组，通过 src 或 textContent 提供脚本。 */
  script?: (HeadAttributes<'script'> & { textContent?: string })[];
  /** noscript 标签数组，通过 innerHTML 提供内容。 */
  noscript?: (HeadAttributes<'noscript'> & { innerHTML: string })[];
}

/**
 * 归一化后的 head 标签。
 */
export interface HeadTag {
  /** 标签名。 */
  tag: 'base' | 'meta' | 'link' | 'style' | 'script' | 'noscript';
  /** 标签属性，使用 React 的属性名。 */
  attrs: Record<string, string | number | boolean>;
  /** 标签的文本内容。 */
  textContent?: string;
  /** 标签的原始 HTML 内容。 */
  innerHTML?: string;
}
