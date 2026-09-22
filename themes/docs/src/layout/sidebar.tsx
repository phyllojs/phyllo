import { useEffect, useState } from 'react';

import { Icon } from '../components/icon';
import { type SidebarEntry } from '../hooks/docs-data';
import { useDocs } from '../hooks/use-docs';

/**
 * 渲染侧边栏条目，嵌套分组递归展开。
 */
function SidebarItems({ items, url }: { items: SidebarEntry[]; url: string }) {
  return (
    <ul>
      {items.map((entry, index) => (
        <li key={'href' in entry ? entry.href : index}>
          {'items' in entry ? (
            <>
              <span className="sidebar-label">{entry.label}</span>
              <SidebarItems items={entry.items} url={url} />
            </>
          ) : (
            <a
              href={entry.href}
              aria-current={entry.href === url ? 'page' : undefined}
            >
              {entry.label}
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * 文档侧边栏：移动端可折叠，桌面端固定展示导航分组。
 */
export function Sidebar() {
  const { page, text, sections } = useDocs();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
      }
    };

    window.addEventListener('keydown', closeOnEscape);

    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [menuOpen]);

  return (
    <nav
      aria-label={text.menu}
      className={`docs-sidebar ${menuOpen ? 'is-open' : ''}`}
      onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setMenuOpen(false);
        }
      }}
      onKeyDown={event => {
        if (event.key === 'Escape' && menuOpen) {
          setMenuOpen(false);
          event.currentTarget.querySelector('button')?.focus();
        }
      }}
    >
      <button
        className="sidebar-toggle"
        type="button"
        aria-expanded={menuOpen}
        aria-controls="docs-navigation"
        onClick={() => setMenuOpen(!menuOpen)}
      >
        {text.menu}
        <Icon name={menuOpen ? 'minus' : 'plus'} />
      </button>
      <div
        id="docs-navigation"
        className="sidebar-content"
        onClick={event => {
          if ((event.target as HTMLElement).closest('a')) {
            setMenuOpen(false);
          }
        }}
      >
        {sections.map((group, index) => (
          <section className="sidebar-group" key={index}>
            <h2>{group.label}</h2>
            <SidebarItems items={group.items} url={page.url} />
          </section>
        ))}
      </div>
    </nav>
  );
}
