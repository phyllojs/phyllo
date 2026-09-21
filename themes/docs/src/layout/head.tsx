import { HeadResources } from 'phyllo';

import { COLOR_SCHEME_SCRIPT } from '../components/color-scheme';
import { useDocs } from '../hooks/use-docs';

/**
 * 文档头部：字符集、视口、颜色模式脚本与页面元信息。
 */
export function Head() {
  const { site, page, frontmatter, text, isHome } = useDocs();
  const title = isHome
    ? (frontmatter.title ?? site.title ?? text.docs)
    : site.title && page.title !== site.title
      ? `${page.title} - ${site.title}`
      : page.title;
  const description = page.description ?? site.description;

  return (
    <head>
      <meta charSet="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <script dangerouslySetInnerHTML={{ __html: COLOR_SCHEME_SCRIPT }} />
      <HeadResources />
      <title>{title}</title>
      {description !== undefined && (
        <meta name="description" content={description} />
      )}
    </head>
  );
}
