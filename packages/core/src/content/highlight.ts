import rehypeShiki from '@shikijs/rehype/core';
import { createBundledHighlighter } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import { bundledLanguages } from 'shiki/langs';
import { bundledThemes } from 'shiki/themes';

/**
 * 创建带文档主题配色的 Shiki 高亮器。
 *
 * @returns 预加载 mdx 与 tsx 语法的高亮器。
 */
function createHighlighter() {
  return createBundledHighlighter({
    langs: bundledLanguages,
    themes: {
      'github-light-default': bundledThemes['github-light-default'],
      'github-dark-default': bundledThemes['github-dark-default'],
    },
    engine: () => createJavaScriptRegexEngine(),
  })({
    /*
     * Shiki 不会自动加载内嵌语法，mdx 需要 tsx 才能解析 JSX 与表达式。
     * 这里按官方文档「预先加载语言」的方案显式加载，其余语言仍按需加载。
     * 参见 https://github.com/shikijs/shiki/issues/887 与 issues/769。
     */
    langs: ['mdx', 'tsx'],
    themes: ['github-light-default', 'github-dark-default'],
  });
}

/** 按需创建的共享高亮器。 */
const cache: { highlighter?: ReturnType<typeof createHighlighter> } = {};

/**
 * 创建为代码块添加语法高亮的 rehype 插件。
 *
 * @returns 按需初始化高亮器的 rehype 插件。
 */
export function rehypeHighlight(): ReturnType<typeof rehypeShiki> {
  return async (...args) => {
    cache.highlighter ??= createHighlighter();

    const highlighter = await cache.highlighter;

    await rehypeShiki(highlighter, {
      themes: { light: 'github-light-default', dark: 'github-dark-default' },
      defaultColor: 'light-dark()',
      lazy: true,
      fallbackLanguage: 'text',
      addLanguageClass: true,
      transformers: [
        {
          pre(node) {
            // 代码块的背景色和基础文字颜色由站点主题控制。
            delete node.properties.style;
          },
        },
      ],
    })(...args);
  };
}
