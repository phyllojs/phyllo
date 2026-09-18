# create-phyllo

创建 Phyllo 站点。`bun create phyllo` 运行的就是这个包，`@phyllo/cli` 在 `phyllo init` 和 `phyllo theme` 中复用它。

[English](./README.md) | 中文

## 使用

需要 Bun 1.4 或更高版本。

```sh
bun create phyllo my-site
```

省略项目名称时，命令会提示输入，然后询问主题，可以选择官方文档主题，也可以在 `themes/` 下新建自定义主题。

选项：

| 选项              | 说明         |
| ----------------- | ------------ |
| `--theme`、`-t`   | 指定主题包名 |
| `--help`、`-h`    | 显示帮助     |
| `--version`、`-v` | 显示版本     |

目标目录必须为空，或只包含 `.git`。创建完成后，在站点目录中运行 `bun install` 和 `bun run dev`。

`phyllo init` 和 `phyllo theme` 的说明见 [命令行工具](https://phyllo.js.org/zh/reference/cli)。
