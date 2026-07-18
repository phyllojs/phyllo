# phyllo

为 Phyllo 主题和 MDX 组件提供 React Hooks 与共享类型。

[English](./README.md) | 中文

## 安装

需要 Bun 1.4 或更高版本。

```sh
bun add phyllo react react-dom
```

## 使用

在 Phyllo 渲染的组件中调用 Hooks：

```tsx
import { usePage } from 'phyllo';

export function PageTitle() {
  const page = usePage();

  return <h1>{page.title}</h1>;
}
```

可用的 Hooks：

| Hook               | 返回内容                                           |
| ------------------ | -------------------------------------------------- |
| `useSite()`        | 站点信息                                           |
| `usePage()`        | 当前页面                                           |
| `useFrontmatter()` | 当前页面的 frontmatter                             |
| `usePages()`       | 文章元数据，不含正文                               |
| `useSearch()`      | 本地查询函数，调用后返回 `Promise<SearchResult[]>` |

包中也导出站点、页面和搜索的类型定义。主题在 `<head>` 中渲染本包导出的 `HeadResources`，输出主题样式、页面数据、客户端脚本和 `head` 配置标签。`phyllo/render` 由生成代码使用，主题不需要导入。

## TypeScript

CSS 导入的类型声明由 `phyllo/client` 提供。在主题 tsconfig 的 `types` 中加入：

```json
{
  "compilerOptions": {
    "types": ["phyllo/client"]
  }
}
```

详细说明见 [Hooks 参考](https://phyllo.js.org/zh/reference/hooks)。
