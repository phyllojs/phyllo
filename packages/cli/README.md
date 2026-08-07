# @phyllo/cli

The `phyllo` command for creating, previewing, and building Phyllo sites.

English | [中文](./README.zh.md)

## Install

Requires Bun 1.4 or later.

```sh
bun add --global @phyllo/cli
```

## Usage

```sh
phyllo init my-site --theme phyllo-theme-docs
cd my-site
bun install
phyllo dev
```

Commands:

| Command                    | Description                      |
| -------------------------- | -------------------------------- |
| `phyllo init [directory]`  | Create a site                    |
| `phyllo dev [directory]`   | Start the preview server         |
| `phyllo build [directory]` | Generate the static site         |
| `phyllo sync [directory]`  | Generate content directory types |
| `phyllo theme <directory>` | Create a theme package           |

`dev`, `build`, and `sync` default to the current directory. Sites created with `bun create phyllo` also include `bun run dev`, `bun run build`, and `bun run sync` scripts. Run `phyllo --help` or `phyllo <command> --help` for all options.

See the [CLI reference](https://phyllo.js.org/en/reference/cli).
