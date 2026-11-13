import { createContext } from 'react';

import type { Resources } from './render/document';

/**
 * 页面头部资源上下文。
 */
export const Context = createContext<Resources | undefined>(undefined);
