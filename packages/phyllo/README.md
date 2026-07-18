# phyllo

React Hooks and shared types for Phyllo themes and MDX components.

English | [中文](./README.zh.md)

## Install

Requires Bun 1.4 or later.

```sh
bun add phyllo react react-dom
```

## Usage

Call Hooks from components rendered by Phyllo:

```tsx
import { usePage } from 'phyllo';

export function PageTitle() {
  const page = usePage();

  return <h1>{page.title}</h1>;
}
```

Available Hooks:

| Hook               | Returns                                                              |
| ------------------ | -------------------------------------------------------------------- |
| `useSite()`        | Site metadata                                                        |
| `usePage()`        | Current page                                                         |
| `useFrontmatter()` | Current page frontmatter                                             |
| `usePages()`       | Article metadata, without loading article bodies                     |
| `useSearch()`      | The local search query function, returning `Promise<SearchResult[]>` |

The package also exports types for site data, pages, and search. Themes render `HeadResources` from this package inside `<head>` to output styles, page data, client scripts and `head` config tags. `phyllo/render` is used by generated code and is not imported by themes.

## TypeScript

Type declarations for CSS imports come from `phyllo/client`. Add it to the `types` array in your theme's tsconfig:

```json
{
  "compilerOptions": {
    "types": ["phyllo/client"]
  }
}
```

See the [Hooks reference](https://phyllo.js.org/en/reference/hooks) for details.
