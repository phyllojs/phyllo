# @phyllo/core

Build, preview, and type generation for Phyllo sites. The [Phyllo CLI](https://phyllo.js.org/en/reference/cli) uses this package.

English | [中文](./README.zh.md)

## Install

Requires Bun 1.4 or later.

```sh
bun add --dev @phyllo/core
```

## Usage

Define the site in `phyllo.config.ts`:

```ts
import { defineConfig } from '@phyllo/core';

export default defineConfig({
  theme: 'phyllo-theme-docs',
  title: 'My site',
  lang: 'en',
});
```

Build it from a script:

```ts
import { build } from '@phyllo/core';

const result = await build('.');

console.log(`Built ${result.pages} pages → ${result.outdir}`);
```

## API

- `build(directory?)` builds the site and returns `outdir`, `pages`, and `files`.
- `dev(directory?, options?)` starts the preview server. Options are `port` and `hostname`. Returns `url`, `exited`, and `stop()`.
- `sync(directory?)` writes `.phyllo/types.d.ts` and returns its absolute path.

All functions take a site directory as the first argument and default to the current directory. `Config`, `BuildResult`, and `DevOptions` are exported as types. See the [configuration reference](https://phyllo.js.org/en/reference/configuration) for all options.
