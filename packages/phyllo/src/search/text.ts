const SEGMENTER = new Intl.Segmenter('und', { granularity: 'word' });

/**
 * 按词切分文本，供索引和高亮使用。
 *
 * @param text - 待切分的文本。
 * @returns 切分出的词语列表。
 */
export function tokenize(text: string): string[] {
  // 部分浏览器会将中文词语标记为非词语，按字符类别保留有效内容。
  return [...SEGMENTER.segment(text)]
    .filter(part => /[\p{L}\p{N}]/u.test(part.segment))
    .map(part => part.segment);
}

/**
 * 截取包含命中词的摘要。
 *
 * @param text - 文档纯文本。
 * @param terms - 命中的词。
 * @returns 最多 180 个字符的摘要，截断处使用省略号。
 */
export function snippet(text: string, terms: string[]): string {
  const pattern = terms
    .map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  const position = pattern ? text.search(new RegExp(pattern, 'i')) : 0;
  const start = Math.max(0, position - 48);
  const excerpt = text.slice(start, start + 180);

  return `${start ? '…' : ''}${excerpt}${start + 180 < text.length ? '…' : ''}`;
}
