# Phyllo

Phyllo 是一个使用 Bun 开发和构建的静态站点框架，用 Markdown 或 MDX 编写文章。

[English](./README.md) | 中文

## 特性

- **Bun 原生**：开发服务器和构建直接使用 Bun，不需要额外的构建工具链。
- **Markdown 与 MDX**：文章使用 `.md` 或 `.mdx` 书写，MDX 在 Markdown 的基础上支持 JSX 组件和表达式。
- **主题**：用 React 组件实现，不需要额外的构建配置。
- **TypeScript 支持**：站点配置和主题接口都带类型定义，编辑器可以补全并检查错误。

## 快速上手

需要 Bun 1.4 或更高版本。

```sh
bun create phyllo my-site
cd my-site
bun install
bun run dev
```

向导会询问使用哪个主题。搭建文档站可以选 `phyllo-theme-docs`，也可以创建自己的主题放在 `themes/` 下。文章放在 `content/`，站点设置放在 `phyllo.config.ts`。

部署前构建：

```sh
bun run build
```

静态文件输出到 `dist/`。

## 包

| 包                                          | 说明                                         |
| ------------------------------------------- | -------------------------------------------- |
| [`phyllo`](./packages/phyllo)               | 主题和 MDX 组件使用的 React Hooks 与共享类型 |
| [`@phyllo/core`](./packages/core)           | 站点的构建、预览与类型生成                   |
| [`@phyllo/cli`](./packages/cli)             | `phyllo` 命令行工具                          |
| [`create-phyllo`](./packages/create-phyllo) | 站点与主题脚手架                             |
| [`phyllo-theme-docs`](./themes/docs)        | 官方文档主题                                 |

## 文档

- [简介](https://phyllo.js.org/zh/guide/introduction)
- [快速上手](https://phyllo.js.org/zh/guide/getting-started)
- [文章写作](https://phyllo.js.org/zh/guide/writing)
- [主题概述](https://phyllo.js.org/zh/themes/overview)
- [部署](https://phyllo.js.org/zh/guide/deployment)
- [站点配置](https://phyllo.js.org/zh/reference/configuration)
- [Hooks](https://phyllo.js.org/zh/reference/hooks)
- [命令行工具](https://phyllo.js.org/zh/reference/cli)

## 参与贡献

问题反馈和代码贡献请提交到 [GitHub](https://github.com/xueelf/phyllo)。

## 许可证

本项目基于 [MIT 许可证](./LICENSE) 发布。
