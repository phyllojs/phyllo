import type { ReactNode } from 'react';

import { useDocs } from '../hooks/use-docs';
import { useOutline } from '../hooks/use-outline';

import { Head } from './head';
import { Header } from './header';
import { Main } from './main';
import { Outline } from './outline';
import { Sidebar } from './sidebar';

import './style.css';

/**
 * 主题布局属性。
 */
export interface LayoutProps {
  children?: ReactNode;
}

/**
 * 文档主题布局：输出 HTML 文档、头部元信息、导航、搜索与正文。
 */
export default function Layout({ children }: LayoutProps) {
  const { page, frontmatter, layout, lang, pages, text } = useDocs();
  const { headings, activeHeading } = useOutline(layout, children);
  const hasSidebar = layout === 'doc' && pages.length > 0;

  if (page.url === '/' && frontmatter.locales !== undefined) {
    return null;
  }

  return (
    <html lang={lang}>
      <Head />
      <body>
        {layout === false ? (
          children
        ) : (
          <>
            <a className="skip-link" href="#main">
              {text.skip}
            </a>
            <Header />
            <div
              className={`docs-shell is-${layout}${hasSidebar ? ' has-sidebar' : ''}`}
            >
              {hasSidebar && <Sidebar />}
              <Main>{children}</Main>
              {layout === 'doc' && headings.length > 0 && (
                <Outline headings={headings} activeHeading={activeHeading} />
              )}
            </div>
          </>
        )}
      </body>
    </html>
  );
}
