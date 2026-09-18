# create-phyllo

Create a Phyllo site. `bun create phyllo` runs this package, and `@phyllo/cli` reuses it for `phyllo init` and `phyllo theme`.

English | [中文](./README.zh.md)

## Usage

Requires Bun 1.4 or later.

```sh
bun create phyllo my-site
```

The command asks for a project name when it is missing, then asks which theme to use: the official documentation theme or a new custom theme under `themes/`.

Options:

| Option            | Description            |
| ----------------- | ---------------------- |
| `--theme`, `-t`   | Select a theme package |
| `--help`, `-h`    | Show help              |
| `--version`, `-v` | Show the version       |

The target directory must be empty or contain only `.git`. After the site is created, run `bun install` and `bun run dev` inside it.

See the [CLI reference](https://phyllo.js.org/en/reference/cli) for `phyllo init` and `phyllo theme`.
