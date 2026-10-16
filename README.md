# Phyllo

Phyllo is a static site framework built with Bun, for writing articles in Markdown or MDX.

English | [中文](./README.zh.md)

## Features

- **Runs on Bun**: the dev server and the build use Bun directly, with no separate build toolchain.
- **Markdown and MDX**: articles are written in `.md` or `.mdx` files. MDX adds JSX components and expressions on top of Markdown.
- **Themes**: built as React component packages, with no extra build configuration.
- **TypeScript support**: site configuration and theme APIs ship with types, so editors provide completion and type checking.

## Quick start

Bun 1.4 or later is required.

```sh
bun create phyllo my-site
cd my-site
bun install
bun run dev
```

The wizard asks which theme to use. Choose `phyllo-theme-docs` for a documentation site, or create a custom theme under `themes/`. Articles go in `content/`, and site settings go in `phyllo.config.ts`.

Build the site for deployment:

```sh
bun run build
```

Static files are written to `dist/`.

## Packages

| Package                                     | Description                                                |
| ------------------------------------------- | ---------------------------------------------------------- |
| [`phyllo`](./packages/phyllo)               | React Hooks and shared types for themes and MDX components |
| [`@phyllo/core`](./packages/core)           | Build, preview, and type generation for sites              |
| [`@phyllo/cli`](./packages/cli)             | The `phyllo` command line tool                             |
| [`create-phyllo`](./packages/create-phyllo) | Site and theme scaffolding                                 |
| [`phyllo-theme-docs`](./themes/docs)        | The official documentation theme                           |

## Documentation

- [Introduction](https://phyllo.js.org/en/guide/introduction)
- [Getting started](https://phyllo.js.org/en/guide/getting-started)
- [Writing](https://phyllo.js.org/en/guide/writing)
- [Themes](https://phyllo.js.org/en/themes/overview)
- [Deployment](https://phyllo.js.org/en/guide/deployment)
- [Site configuration](https://phyllo.js.org/en/reference/configuration)
- [Hooks](https://phyllo.js.org/en/reference/hooks)
- [CLI](https://phyllo.js.org/en/reference/cli)

## Contributing

Bug reports and pull requests are welcome on [GitHub](https://github.com/phyllojs/phyllo).

## License

Released under the [MIT License](./LICENSE).
