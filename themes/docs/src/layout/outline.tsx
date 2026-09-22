import { useDocs } from '../hooks/use-docs';
import type { Heading } from '../hooks/use-outline';

/**
 * 本页内容导航，高亮当前浏览的标题。
 */
export function Outline({
  headings,
  activeHeading,
}: {
  headings: Heading[];
  activeHeading: string;
}) {
  const { text } = useDocs();

  return (
    <nav className="docs-outline" aria-label={text.contents}>
      <h2>{text.contents}</h2>
      <ul>
        {headings.map(heading => (
          <li
            key={heading.id}
            className={heading.level === 3 ? 'outline-subitem' : undefined}
          >
            <a
              href={`#${heading.id}`}
              aria-current={
                activeHeading === heading.id ? 'location' : undefined
              }
            >
              <span>{heading.title}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
