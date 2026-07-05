import { type ReactNode, createElement, useContext } from 'react';

import { Context } from '../context';
import type { HeadTag } from '../head';

/**
 * 页面头部资源，由 core 注入到渲染上下文。
 */
export interface Resources {
  /** 主题样式表路径。 */
  styles: string[];
  /** 主题脚本路径。 */
  scripts: string[];
  /** 站点配置追加的 head 标签。 */
  head?: HeadTag[];
  /** 主题显式输出的文档元素，用于匹配浏览器解析后的接管位置。 */
  elements?: Array<'html' | 'head' | 'body'>;
}

/**
 * 头部资源组件的属性。
 */
interface HeadResourcesProps {
  /** 当前页面的头部资源，省略时从渲染上下文读取。 */
  resources?: Resources;
  /** 主题在 head 中输出的内容。 */
  children?: ReactNode;
}

/**
 * 输出头部资源：prelude、主题内容、样式、配置标签与脚本。
 *
 * 主题在 `<head>` 中渲染这个组件；没有 head 的主题由 core 单独渲染。
 */
export function HeadResources({ resources, children }: HeadResourcesProps) {
  const context = useContext(Context);
  const current = resources ?? context?.resources;
  const head = current?.head;

  return (
    <>
      {head
        ?.filter(isHeadPrelude)
        .map((tag, index) => renderHeadTag(tag, index))}
      {children}
      {current?.styles.map(href => (
        <link key={href} rel="stylesheet" href={href} />
      ))}
      {head
        ?.filter(tag => !isHeadPrelude(tag))
        .map((tag, index) => renderHeadTag(tag, index))}
      <Scripts resources={current} />
    </>
  );
}

/**
 * 判断标签是否为需要优先输出的 head prelude。
 *
 * @param tag - head 标签。
 * @returns 标签需要在主题内容之前输出时为 `true`。
 */
function isHeadPrelude({ tag, attrs }: HeadTag) {
  return tag === 'base' || (tag === 'meta' && attrs.charSet !== undefined);
}

/**
 * 把归一化的 head 标签渲染为原生元素。
 *
 * @param tag - head 标签。
 * @param index - 标签在同类标签中的序号，保证 key 唯一。
 * @returns 标签节点。
 */
function renderHeadTag(tag: HeadTag, index: number) {
  const { tag: name, attrs, textContent, innerHTML } = tag;
  const props: Record<string, unknown> = { key: index, ...attrs };

  if (innerHTML !== undefined) {
    props.dangerouslySetInnerHTML = { __html: innerHTML };
  } else if (textContent !== undefined) {
    if (name === 'script' || name === 'style') {
      props.dangerouslySetInnerHTML = { __html: textContent };
    } else {
      props.children = textContent;
    }
  }
  return createElement(name, props);
}

/**
 * 输出资源描述脚本与主题脚本。
 *
 * @param props - 组件属性。
 * @returns 脚本节点，没有资源时为 `null`。
 */
function Scripts({ resources }: { resources?: Resources }) {
  if (!resources) {
    return null;
  }
  const json = JSON.stringify(resources).replace(/</g, '\\u003c');

  return (
    <>
      <script
        id="phyllo-resources"
        type="application/json"
        dangerouslySetInnerHTML={{ __html: json }}
      />
      {resources.scripts.map(src => (
        <script key={src} type="module" src={src} />
      ))}
    </>
  );
}
