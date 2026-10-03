# phyllo-theme-docs

Phyllo 官方文档主题，提供章节导航、侧栏、搜索、页内目录和可自定义的首页。

[English](./README.md) | 中文

## 使用

创建站点时选择这个主题：

```sh
bun create phyllo my-site --theme phyllo-theme-docs
cd my-site
bun install
bun run dev
```

已有站点的安装方法见 [安装与使用](https://phyllo.js.org/zh/themes/installation#npm-themes)。

## 配置

根首页 `content/index.mdx` 的 frontmatter 保存所有语言共用的设置：`logo`、`links`、`locales`、`search` 和默认的 `nav`。各语言首页定义自己的导航和首页内容。站点名称、描述、本地索引开关和 favicon 写在 `phyllo.config.ts` 中。

Algolia 是可选能力。在根首页的 frontmatter 中设置 `search: { provider: 'algolia', options: { appId, apiKey, indexName } }`，并在站点中安装 `algoliasearch`。

## 文档

- [使用文档主题](https://phyllo.js.org/zh/themes/docs)
- [组织导航](https://phyllo.js.org/zh/themes/docs/navigation)
- [自定义首页](https://phyllo.js.org/zh/themes/docs/homepage)
- [页面布局](https://phyllo.js.org/zh/themes/docs/layout)
- [修改配色](https://phyllo.js.org/zh/themes/docs/styles)
- [配置搜索](https://phyllo.js.org/zh/themes/docs/search)
- [多语言文档](https://phyllo.js.org/zh/themes/docs/languages)
- [主题配置](https://phyllo.js.org/zh/themes/docs/configuration)
