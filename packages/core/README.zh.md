# @phyllo/core

Phyllo 站点的构建、预览与类型生成，[Phyllo CLI](https://phyllo.js.org/zh/reference/cli) 也基于这个包。

[English](./README.md) | 中文

## 安装

需要 Bun 1.4 或更高版本。

```sh
bun add --dev @phyllo/core
```

## 使用

在 `phyllo.config.ts` 中定义站点：

```ts
import { defineConfig } from '@phyllo/core';

export default defineConfig({
  theme: 'phyllo-theme-docs',
  title: 'My site',
  lang: 'en',
});
```

在脚本中构建站点：

```ts
import { build } from '@phyllo/core';

const result = await build('.');

console.log(`Built ${result.pages} pages → ${result.outdir}`);
```

## API

- `build(directory?)` 构建站点，返回 `outdir`、`pages` 和 `files`。
- `dev(directory?, options?)` 启动预览服务，选项有 `port` 和 `hostname`，返回 `url`、`exited` 和 `stop()`。
- `sync(directory?)` 写入 `.phyllo/types.d.ts`，返回该文件的绝对路径。

三个函数都接受站点目录参数，默认使用当前目录。包中导出了 `Config`、`BuildResult` 和 `DevOptions` 类型。全部配置项见 [站点配置参考](https://phyllo.js.org/zh/reference/configuration)。
