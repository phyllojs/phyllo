# phyllo-theme-docs

The official documentation theme for Phyllo, with chapter navigation, a sidebar, search, a page outline, and a customizable home page.

English | [中文](./README.zh.md)

## Usage

Choose the theme when creating a site:

```sh
bun create phyllo my-site --theme phyllo-theme-docs
cd my-site
bun install
bun run dev
```

To add it to an existing site, see [Install and use](https://phyllo.js.org/en/themes/installation#npm-themes).

## Configuration

The root home page frontmatter in `content/index.mdx` holds the settings shared by all languages: `logo`, `links`, `locales`, `search`, and the default `nav`. Each language home page defines its own navigation and home page content. Site title, description, local search switch, and favicon live in `phyllo.config.ts`.

Algolia is optional. Set `search: { provider: 'algolia', options: { appId, apiKey, indexName } }` in the root home page frontmatter and install `algoliasearch` in the site.

## Documentation

- [Using the docs theme](https://phyllo.js.org/en/themes/docs)
- [Navigation](https://phyllo.js.org/en/themes/docs/navigation)
- [Home page](https://phyllo.js.org/en/themes/docs/homepage)
- [Page layouts](https://phyllo.js.org/en/themes/docs/layout)
- [Colors](https://phyllo.js.org/en/themes/docs/styles)
- [Search](https://phyllo.js.org/en/themes/docs/search)
- [Languages](https://phyllo.js.org/en/themes/docs/languages)
- [Theme configuration](https://phyllo.js.org/en/themes/docs/configuration)
