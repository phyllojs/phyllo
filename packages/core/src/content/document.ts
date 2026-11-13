import type { Nodes, Root } from 'hast';

/** HTML 块元素、表格单元与换行元素形成文字边界。 */
const BLOCK_TAGS = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'br',
  'dd',
  'details',
  'div',
  'dl',
  'dt',
  'fieldset',
  'figcaption',
  'figure',
  'footer',
  'form',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hr',
  'legend',
  'li',
  'main',
  'nav',
  'ol',
  'p',
  'pre',
  'section',
  'summary',
  'table',
  'td',
  'th',
  'tr',
  'ul',
]);

/** 不属于正文的 HTML 元素。 */
const IGNORED_TAGS = new Set([
  'head',
  'noscript',
  'script',
  'style',
  'template',
  'title',
]);

/** 搜索索引中的页面或章节。 */
export interface DocumentSection {
  /** 页面地址，章节带标题锚点。 */
  url: string;
  /** 章节标题，页面段为空字符串。 */
  heading: string;
  /** 静态正文。 */
  text: string;
}

/**
 * 判断最终语法树是否包含正文或动态内容，不把模块声明和注释视为正文。
 *
 * @param node - HTML 语法树节点。
 * @returns 节点包含正文时为 `true`。
 */
function hasContent(node: Nodes): boolean {
  if (node.type === 'mdxFlowExpression' || node.type === 'mdxTextExpression') {
    return !!node.data?.estree?.body.length;
  }

  if (node.type === 'text') {
    return !!node.value.trim();
  }

  if (
    node.type === 'element' ||
    node.type === 'mdxJsxFlowElement' ||
    node.type === 'mdxJsxTextElement'
  ) {
    return true;
  }
  return 'children' in node && node.children.some(hasContent);
}

/**
 * 读取 HTML 或 MDX JSX 元素的标签名。
 *
 * @param node - HTML 语法树节点。
 * @returns 标签名，片段和非元素节点没有标签名。
 */
function elementName(node: Nodes) {
  return node.type === 'element'
    ? node.tagName
    : node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement'
      ? node.name
      : undefined;
}

/**
 * 读取源码中明确声明的 id，不执行表达式。
 *
 * @param node - HTML 语法树节点。
 * @returns 最后一次 id 赋值，展开属性的值未知时为 `null`，未声明时为 `undefined`。
 */
function elementId(node: Nodes) {
  if (node.type === 'element') {
    return node.properties.id;
  }

  if ('attributes' in node) {
    const attribute = node.attributes.findLast(
      attribute =>
        attribute.type === 'mdxJsxExpressionAttribute' ||
        (attribute.type === 'mdxJsxAttribute' && attribute.name === 'id'),
    );

    return attribute?.type === 'mdxJsxAttribute'
      ? attribute.value
      : attribute
        ? null
        : undefined;
  }
}

/**
 * 遍历静态文字。标题和正文共用相同的行内连接、块分隔和动态内容规则。
 *
 * @param node - 当前节点。
 * @param write - 收集文字，省略时只处理标题。
 * @param heading - 单独处理标题，省略时按普通文字遍历标题内容。
 */
function walkText(
  node: Nodes,
  write?: (text: string) => void,
  heading?: (node: Nodes, tag: string) => boolean,
) {
  const tag = elementName(node);

  if (typeof tag === 'string' && IGNORED_TAGS.has(tag)) {
    return;
  }

  if (
    heading &&
    typeof tag === 'string' &&
    /^h[1-6]$/.test(tag) &&
    heading(node, tag)
  ) {
    return;
  }

  if (
    ((node.type === 'mdxFlowExpression' || node.type === 'mdxTextExpression') &&
      !!node.data?.estree?.body.length) ||
    (node.type === 'mdxJsxTextElement' &&
      node.name !== null &&
      /^[^a-z]|\./.test(node.name) &&
      node.children.length === 0)
  ) {
    write?.(' ');

    return;
  }
  const block =
    node.type === 'mdxJsxFlowElement' ||
    (typeof tag === 'string' && BLOCK_TAGS.has(tag));

  if (block) {
    write?.(' ');
  }

  if (node.type === 'text') {
    write?.(node.value);
  } else if ('children' in node) {
    for (const child of node.children) {
      walkText(child, write, heading);
    }
  }

  if (block) {
    write?.(' ');
  }
}

/**
 * 归一化索引和标题中的空白。
 *
 * @param text - 原始文字。
 * @returns 单个空格分隔的文字。
 */
function normalizeText(text: string) {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * 分析文档标题、锚点和可选的搜索正文。
 *
 * @param tree - HTML 语法树。
 * @param url - 页面地址。
 * @param search - 是否收集搜索正文。
 * @returns 页面标题与搜索段落。
 * @throws 同一文档重复声明 id 时抛出错误。
 */
export function analyzeDocument(tree: Root, url: string, search: boolean) {
  const used = new Set<string>();
  const initial = { url, heading: '', text: '' };
  const sections: DocumentSection[] = search ? [initial] : [];

  let current = initial;
  let title = '';

  /**
   * 先登记所有显式 id，自动锚点避开后文声明的 id。
   *
   * @param node - 当前节点。
   */
  function reserve(node: Nodes) {
    if (node.type === 'element' && /^h[1-6]$/.test(node.tagName)) {
      const last = node.children.at(-1);

      if (last?.type === 'text') {
        const match = /\s+\{#(?<id>[^\s{}]+)\}\s*$/.exec(last.value);
        const id = match?.groups?.['id'];

        if (match && id !== undefined) {
          last.value = last.value.slice(0, match.index);
          node.properties.id = id;
        }
      }
    }
    const id = elementId(node);

    if (typeof id === 'string') {
      if (used.has(id)) {
        throw new Error(`Duplicate anchor #${id} in ${url}`);
      }
      used.add(id);
    }

    if ('children' in node) {
      node.children.forEach(reserve);
    }
  }

  reserve(tree);

  walkText(
    tree,
    search
      ? text => {
          current.text += text;
        }
      : undefined,
    (node, tag) => {
      let id = elementId(node);

      if (tag !== 'h1' && id !== undefined && typeof id !== 'string') {
        current = initial;

        return !search;
      }
      const fragments: string[] = [];

      walkText(node, fragment => {
        fragments.push(fragment);
      });

      const heading = normalizeText(fragments.join(''));

      if (id === undefined) {
        const base =
          heading
            .toLowerCase()
            .replace(/[^\p{L}\p{N}]+/gu, '-')
            .replace(/^-|-$/g, '') || 'section';

        id = base;

        for (let suffix = 2; used.has(id); suffix += 1) {
          id = `${base}-${suffix}`;
        }
        used.add(id);

        if (node.type === 'element') {
          node.properties.id = id;
        } else if ('attributes' in node) {
          node.attributes.push({
            type: 'mdxJsxAttribute',
            name: 'id',
            value: id,
          });
        }
      }

      if (tag === 'h1') {
        title ||= heading;

        return true;
      } else if (search && typeof id === 'string') {
        current = {
          url: `${url}#${encodeURIComponent(id)}`,
          heading,
          text: '',
        };
        sections.push(current);
      }

      return !search || typeof id === 'string';
    },
  );

  for (const section of sections) {
    section.text = normalizeText(section.text);
  }

  return { heading: title, sections, hasContent: hasContent(tree) };
}
