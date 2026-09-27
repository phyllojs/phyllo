import { useRef, useState } from 'react';

import { useAlgolia } from '../../hooks/use-algolia';
import { useDocs } from '../../hooks/use-docs';
import { useLocalSearch } from '../../hooks/use-local-search';
import { Icon } from '../icon';

import './style.css';

/**
 * 高亮搜索结果中的命中词。
 */
function SearchText({ value, terms }: { value: string; terms: string[] }) {
  if (!terms.length) {
    return <>{value}</>;
  }
  const pattern = new RegExp(
    `(${terms
      .map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .sort((a, b) => b.length - a.length)
      .join('|')})`,
    'gi',
  );

  return (
    <>
      {value
        .split(pattern)
        .map((part, index) =>
          index % 2 ? <mark key={index}>{part}</mark> : part,
        )}
    </>
  );
}

/**
 * 搜索入口按钮与结果对话框，本地索引与 Algolia 共用同一界面。
 */
export function Search() {
  const { text, lang, searchDirectory, search } = useDocs();
  const [query, setQuery] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const keyboard = useRef(false);
  const [open, setOpen] = useState(false);
  const algolia =
    search && search.provider === 'algolia' ? search.options : undefined;
  const localSearch = useLocalSearch(
    search && search.provider === 'local' ? query : '',
    {
      directory: searchDirectory,
    },
  );
  const algoliaSearch = useAlgolia(algolia ? query : '', algolia, {
    lang,
  });
  const { results, isLoading, error, retry } = algolia
    ? algoliaSearch
    : localSearch;

  if (search === false) {
    return null;
  }

  return (
    <>
      <button
        ref={trigger}
        className="header-control icon-button"
        type="button"
        aria-label={text.searchButton}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={event => {
          keyboard.current = event.detail === 0;
          dialog.current?.showModal();
          setOpen(true);
        }}
      >
        <Icon name="search" />
      </button>
      <dialog
        className="search-dialog"
        closedby="any"
        ref={dialog}
        aria-label={text.searchButton}
        onClose={() => {
          if (!keyboard.current && document.activeElement === trigger.current) {
            trigger.current?.blur();
          }
          setOpen(false);
          setQuery('');
        }}
        onKeyDown={event => {
          if (event.nativeEvent.isComposing) {
            return;
          }

          if (['Tab', 'ArrowDown', 'ArrowUp'].includes(event.key)) {
            keyboard.current = true;
          }
          const links = Array.from(
            dialog.current!.querySelectorAll<HTMLAnchorElement>(
              '.search-results a',
            ),
          );
          const position = links.indexOf(event.target as HTMLAnchorElement);

          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();

            const next =
              event.key === 'ArrowDown' ? position + 1 : position - 1;

            if (next < 0) {
              dialog.current?.querySelector('input')?.focus();
            } else {
              links[Math.min(next, links.length - 1)]?.focus();
            }
          } else if (
            event.key === 'Enter' &&
            event.target instanceof HTMLInputElement
          ) {
            const [firstLink] = links;

            event.preventDefault();
            firstLink?.click();
          }
        }}
      >
        <form
          className="search-form"
          role="search"
          aria-label={text.searchButton}
          method="dialog"
        >
          <label className="search-field">
            <Icon name="search" />
            <input
              type="search"
              aria-label={text.search}
              placeholder={text.search}
              value={query}
              autoFocus
              autoComplete="off"
              spellCheck={false}
              onChange={event => setQuery(event.currentTarget.value)}
            />
          </label>
          <button
            className="header-control icon-button"
            type="submit"
            aria-label={text.close}
          >
            <Icon name="close" />
          </button>
        </form>
        <div className="search-results" aria-busy={isLoading}>
          {isLoading ? (
            <p role="status">{text.searchLoading}</p>
          ) : error ? (
            <p role="status">
              {text.searchFailed}{' '}
              <button className="header-control" type="button" onClick={retry}>
                {text.retry}
              </button>
            </p>
          ) : !query.trim() ? (
            <p role="status">{text.searchHint}</p>
          ) : results.length ? (
            <ul>
              {results.map(result => (
                <li key={result.url}>
                  <a href={result.url} onClick={() => dialog.current?.close()}>
                    <div className="search-result-content">
                      {result.heading && (
                        <small className="search-result-page">
                          <SearchText
                            value={result.title}
                            terms={result.terms}
                          />
                        </small>
                      )}
                      <strong>
                        <SearchText
                          value={result.heading || result.title}
                          terms={result.terms}
                        />
                      </strong>
                      {result.snippet && (
                        <span>
                          <SearchText
                            value={result.snippet}
                            terms={result.terms}
                          />
                        </span>
                      )}
                    </div>
                    <Icon name="arrow" />
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p role="status">{text.empty}</p>
          )}
        </div>
      </dialog>
    </>
  );
}
