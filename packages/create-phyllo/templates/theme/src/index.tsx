import { HeadResources, usePage, usePages, useSite } from 'phyllo';
import type { ReactNode } from 'react';

/**
 * 站点布局：渲染站点标题、文章导航与当前页面正文。
 */
export default function Layout({ children }: { children?: ReactNode }) {
  const page = usePage();
  const pages = usePages();
  const site = useSite();
  const description = page.description ?? site.description;

  return (
    <html lang={site.lang}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <HeadResources />
        <title>{page.title}</title>
        {description !== undefined && (
          <meta name="description" content={description} />
        )}
      </head>
      <body>
        <header>
          <a href="/">{site.title}</a>
          <nav>
            {pages
              .filter(article => article.url !== '/')
              .map(article => (
                <a key={article.url} href={article.url}>
                  {article.title}
                </a>
              ))}
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
