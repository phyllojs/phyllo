import { createContext } from 'react';

import type { Resources } from './render/document';

/**
 * 渲染上下文，供头部资源读取。
 */
export interface PageContext {
  /** 当前页面的头部资源。 */
  resources?: Resources;
}

/**
 * 页面渲染上下文。
 */
export const Context = createContext<PageContext | undefined>(undefined);
