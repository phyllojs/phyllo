import type { ReactNode } from 'react';

import { useDocs } from '../../hooks/use-docs';

import './style.css';

/**
 * 提示框类型，决定配色和默认标题。
 */
export type CalloutType = 'note' | 'tip' | 'info' | 'warning' | 'danger';

/**
 * 文章中的提示框组件，供 MDX 使用。
 */
export function Callout({
  type = 'note',
  title,
  children,
}: {
  type?: CalloutType;
  title?: string;
  children: ReactNode;
}) {
  const { text } = useDocs();

  return (
    <aside className="doc-callout" data-type={type}>
      <strong className="doc-callout-title">
        {title ?? text.callout[type]}
      </strong>
      {children}
    </aside>
  );
}
