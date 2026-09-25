import { useFrontmatter } from 'phyllo';
import { type ReactNode, Children } from 'react';

import { type DocsFrontmatter } from '../../hooks/docs-data';
import { useDocs } from '../../hooks/use-docs';
import { Icon } from '../icon';

import './style.css';

/**
 * 首页 Hero 区块，内容来自首页 frontmatter，缺省回退到站点信息。
 */
export function Hero({ children }: { children?: ReactNode }) {
  const { site, frontmatter, text, pages } = useDocs();
  const hero = frontmatter.hero;
  const [firstPage] = pages;
  const title = hero?.title ?? site.title ?? text.docs;
  const description = hero?.description ?? site.description;
  const actions =
    hero?.actions ??
    (firstPage ? [{ label: text.start, href: firstPage.href }] : []);
  const content = Children.toArray(children);
  const image = hero?.image;
  const visual = content.length
    ? content
    : image && <img src={image.src} alt={image.alt} width={320} />;

  return (
    <section className="docs-hero">
      <div className="hero-copy">
        <h1>{title}</h1>
        {description && <p className="hero-description">{description}</p>}
        {actions.length > 0 && (
          <div className="hero-actions">
            {actions.map(action => (
              <a className="hero-link" href={action.href} key={action.href}>
                {action.label}
                <Icon name="arrow" />
              </a>
            ))}
          </div>
        )}
      </div>
      {visual && <div className="hero-visual doc-content">{visual}</div>}
    </section>
  );
}

/**
 * 首页特性列表，内容来自首页 frontmatter 的 features。
 */
export function Features() {
  const frontmatter = useFrontmatter<DocsFrontmatter>();

  return frontmatter.features?.length ? (
    <ul className="home-features">
      {frontmatter.features.map(feature => (
        <li key={feature.title}>
          <h2>{feature.title}</h2>
          <p>{feature.description}</p>
        </li>
      ))}
    </ul>
  ) : null;
}
