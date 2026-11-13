/** Algolia DocSearch 爬虫生成的记录中主题使用的字段。 */
interface DocSearchRecord {
  url: string;
  hierarchy: Record<string, string | null | undefined>;
  content?: string | null;
}

/**
 * 校验远程记录的字段类型，避免错误数据进入搜索结果渲染。
 *
 * @param value - Algolia 返回的记录。
 * @returns 符合 DocSearch 字段约定的原始记录。
 * @throws 地址、标题层级或正文不符合约定时抛出错误。
 */
export function parseDocSearchRecord(value: unknown): DocSearchRecord {
  const record = value as Partial<DocSearchRecord> | null;

  if (
    !record ||
    typeof record !== 'object' ||
    typeof record.url !== 'string' ||
    !/^(https?:\/\/|\/(?!\/))/.test(record.url) ||
    !record.hierarchy ||
    typeof record.hierarchy !== 'object' ||
    Array.isArray(record.hierarchy) ||
    (record.content != null && typeof record.content !== 'string') ||
    Array.from(
      { length: 7 },
      (_, level) => record.hierarchy?.[`lvl${level}`],
    ).some(level => level != null && typeof level !== 'string')
  ) {
    throw new Error(
      'Algolia record url, hierarchy, or content does not match the DocSearch schema.',
    );
  }
  return record as DocSearchRecord;
}
