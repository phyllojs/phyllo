# @phyllo/cli

提供 `phyllo` 命令，用于创建、预览和构建 Phyllo 站点。

[English](./README.md) | 中文

## 安装

需要 Bun 1.4 或更高版本。

```sh
bun add --global @phyllo/cli
```

## 使用

```sh
phyllo init my-site --theme phyllo-theme-docs
cd my-site
bun install
phyllo dev
```

命令：

| 命令                       | 说明             |
| -------------------------- | ---------------- |
| `phyllo init [directory]`  | 创建站点         |
| `phyllo dev [directory]`   | 启动预览服务     |
| `phyllo build [directory]` | 生成静态站点     |
| `phyllo sync [directory]`  | 生成内容目录类型 |
| `phyllo theme <directory>` | 创建主题包       |

`dev`、`build` 和 `sync` 默认使用当前目录。用 `bun create phyllo` 创建的站点也包含 `bun run dev`、`bun run build` 和 `bun run sync` 脚本。运行 `phyllo --help` 或 `phyllo <command> --help` 查看全部选项。

命令与选项说明见 [命令行工具](https://phyllo.js.org/zh/reference/cli)。
