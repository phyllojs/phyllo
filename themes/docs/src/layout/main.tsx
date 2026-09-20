import type { ReactNode } from 'react';

import { Features, Hero } from '../components/home';
import { Icon } from '../components/icon';
import { useDocs } from '../hooks/use-docs';

/**
 * 正文区域：按布局输出文档正文、面包屑与上下篇导航。
 */
export function Main({ children }: { children?: ReactNode }) {
  const { layout, page, home, pages, breadcrumbs, text } = useDocs();
  const currentIndex = pages.findIndex(article => article.href === page.url);
  const previous = pages[currentIndex - 1];
  const next = currentIndex < 0 ? undefined : pages[currentIndex + 1];

  return (
    <main
      id="main"
      className={`docs-main${layout === 'home' ? ' docs-home' : ''}${layout === 'home' && page.hasContent ? ' home-content doc-content' : ''}`}
    >
      {layout === 'page' ? (
        <article className="doc-content">{children}</article>
      ) : layout === 'doc' ? (
        <>
          <nav className="doc-breadcrumb" aria-label={text.breadcrumb}>
            <ol>
              <li>
                <a href={home}>{text.home}</a>
              </li>
              {breadcrumbs.map((label, index) => (
                <li key={index}>{label}</li>
              ))}
            </ol>
          </nav>
          <article className="doc-content">{children}</article>
          {(previous || next) && (
            <nav className="doc-pagination" aria-label={text.pagination}>
              {previous && (
                <a href={previous.href} rel="prev">
                  <small>
                    <Icon name="arrow" />
                    {text.previous}
                  </small>
                  <strong>{previous.label}</strong>
                </a>
              )}
              {next && (
                <a href={next.href} rel="next">
                  <small>
                    {text.next}
                    <Icon name="arrow" />
                  </small>
                  <strong>{next.label}</strong>
                </a>
              )}
            </nav>
          )}
        </>
      ) : page.hasContent ? (
        children
      ) : (
        <>
          <Hero />
          <Features />
        </>
      )}
    </main>
  );
}
