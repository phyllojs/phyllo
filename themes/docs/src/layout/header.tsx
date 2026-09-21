import { ColorSchemeToggle } from '../components/color-scheme';
import { Dropdown } from '../components/dropdown';
import { Icon, LINK_ICON_LABELS } from '../components/icon';
import { Search } from '../components/search';
import { useDocs } from '../hooks/use-docs';

/**
 * 站点头部：品牌、主导航、搜索、明暗切换、语言与外链。
 */
export function Header() {
  const { site, page, home, nav, activeNav, languages, text } = useDocs();

  return (
    <header className="docs-header">
      <a className="docs-brand" href={home}>
        {site.logo && <img src={site.logo} alt="" width="28" height="28" />}
        {site.title ?? 'Docs'}
      </a>

      {nav.length ? (
        <nav className="header-nav" aria-label={text.navigation}>
          {nav.map((link, index) =>
            'items' in link ? (
              <Dropdown
                key={index}
                label={link.label}
                active={link.items.some(entry => entry === activeNav)}
              >
                {link.items.map(entry => (
                  <li key={entry.href}>
                    <a
                      href={entry.href}
                      aria-current={
                        activeNav === entry
                          ? page.url === entry.href
                            ? 'page'
                            : 'true'
                          : undefined
                      }
                    >
                      {entry.label}
                    </a>
                  </li>
                ))}
              </Dropdown>
            ) : (
              <a
                className="header-control"
                href={link.href}
                key={index}
                aria-current={
                  activeNav === link
                    ? page.url === link.href
                      ? 'page'
                      : 'true'
                    : undefined
                }
              >
                {link.label}
              </a>
            ),
          )}
        </nav>
      ) : null}
      <div className="header-actions">
        <Search />
        <ColorSchemeToggle dark={text.dark} light={text.light} />
        {languages.length > 1 && (
          <Dropdown label={text.language} icon={<Icon name="language" />}>
            {languages.map(language => (
              <li key={language.lang}>
                <a
                  className="language-option"
                  href={language.url}
                  lang={language.lang}
                  hrefLang={language.lang}
                  aria-current={language.current ? 'true' : undefined}
                  aria-disabled={!language.url || undefined}
                >
                  <span>{language.label}</span>
                  {language.current && <Icon name="check" />}
                </a>
              </li>
            ))}
          </Dropdown>
        )}
        {site.links?.map(link => (
          <a
            className="header-control icon-button"
            aria-label={LINK_ICON_LABELS[link.icon]}
            key={link.href}
            href={link.href}
          >
            <Icon name={link.icon} />
          </a>
        ))}
      </div>
    </header>
  );
}
