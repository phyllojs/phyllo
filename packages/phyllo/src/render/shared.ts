import type { Resources } from './document';

/** 服务端渲染后交给浏览器接管的数据。 */
type HydrationData = Resources & {
  url: string;
  elements: NonNullable<Resources['elements']>;
};

/**
 * 读取服务端输出的资源描述。
 *
 * @returns 当前页面的资源。
 */
export function readResources(): HydrationData {
  return JSON.parse(
    document.getElementById('phyllo-resources')!.textContent!,
  ) as HydrationData;
}

/**
 * 按主题输出的文档元素选择接管容器。
 *
 * @param elements - 主题输出的文档元素。
 * @returns 接管使用的容器。
 */
export function hydrateContainer(
  elements: NonNullable<Resources['elements']>,
): Element | Document {
  return elements.includes('html')
    ? document
    : elements.length
      ? document.documentElement
      : document.body;
}
