import { defineConfig } from '@phyllo/core';

export default defineConfig({
  theme: 'phyllo-theme-docs',
  title: 'Phyllo',
  description: '使用 Markdown 与 MDX 编写文档站和博客，并用 Bun 预览和构建。',
  search: true,
  head: {
    link: [
      { rel: 'icon', type: 'image/svg+xml', href: '/logo.svg' },
      { rel: 'stylesheet', href: '/custom.css' },
    ],
  },
  redirects: {
    '/': '/zh',
  },
});
