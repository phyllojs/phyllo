import { type ReactNode, useEffect, useState } from 'react';

import { type DocsLayout } from './docs-data';
import { useDocs } from './use-docs';

/**
 * 目录中的标题条目。
 */
export interface Heading {
  id: string;
  title: string;
  level: number;
}

/**
 * 生成页面内不重复的标题锚点。
 *
 * @param base - 由标题文本生成的锚点。
 * @param used - 页面已使用的锚点集合。
 * @returns 可用的锚点。
 */
function uniqueId(base: string, used: Set<string>): string {
  for (let suffix = 1; ; suffix += 1) {
    const id = suffix === 1 ? base : `${base}-${suffix}`;

    if (!used.has(id)) {
      used.add(id);

      return id;
    }
  }
}

/**
 * 为正文标题生成锚点，并跟踪当前浏览的标题。
 *
 * @param layout - 当前页面布局。
 * @param children - 正文内容，内容变化后重建锚点。
 * @returns 目录条目与当前高亮的标题。
 */
export function useOutline(layout: DocsLayout, children: ReactNode) {
  const { page, text } = useDocs();
  const [headings, setHeadings] = useState<Heading[]>([]);
  const [activeHeading, setActiveHeading] = useState('');

  useEffect(() => {
    if (layout === false || layout === 'home') {
      return;
    }
    const used = new Set(
      Array.from(document.querySelectorAll('[id]'), element => element.id),
    );
    const allHeadings = Array.from(
      document.querySelectorAll<HTMLElement>(
        '.doc-content :is(h1, h2, h3, h4, h5, h6)',
      ),
    );
    const anchors: HTMLAnchorElement[] = [];

    for (const element of allHeadings) {
      if (!element.id) {
        const base =
          element.textContent
            ?.trim()
            .toLowerCase()
            .replace(/[^\p{L}\p{N}]+/gu, '-')
            .replace(/^-|-$/g, '') || 'section';

        element.id = uniqueId(base, used);
      }
      const anchor = document.createElement('a');

      anchor.className = 'heading-anchor';
      anchor.href = `#${encodeURIComponent(element.id)}`;

      anchor.setAttribute(
        'aria-label',
        `${text.anchor}: ${element.textContent}`,
      );

      const icon = document.createElement('span');

      icon.className = 'icon icon-link';
      icon.setAttribute('aria-hidden', 'true');
      anchor.append(icon);
      element.append(anchor);
      anchors.push(anchor);
    }

    if (location.hash) {
      try {
        document
          .getElementById(decodeURIComponent(location.hash.slice(1)))
          ?.scrollIntoView();
      } catch {
        // 锚点编码无效时跳过定位，继续初始化页面。
      }
    }

    if (layout === 'page') {
      return () => anchors.forEach(anchor => anchor.remove());
    }
    const elements = allHeadings.filter(element => element.matches('h2, h3'));

    setHeadings(
      elements.map(element => ({
        id: element.id,
        title: element.textContent ?? '',
        level: Number(element.tagName.slice(1)),
      })),
    );

    const frame = { current: 0 };

    const updateActiveHeading = () => {
      frame.current = 0;

      const offset = parseFloat(
        getComputedStyle(document.documentElement).scrollPaddingTop,
      );
      const visible = elements.filter(
        element => element.getClientRects().length,
      );
      const [lastVisible] = visible.toReversed();
      const reached = visible.findLast(
        element => element.getBoundingClientRect().top <= offset + 1,
      );
      const atEnd =
        window.scrollY + window.innerHeight >=
        document.documentElement.scrollHeight - 1;
      const active =
        window.scrollY <= 0
          ? ''
          : atEnd
            ? (lastVisible?.id ?? '')
            : (reached?.id ?? '');

      setActiveHeading(active);
    };
    const schedule = () => {
      if (!frame.current) {
        frame.current = requestAnimationFrame(updateActiveHeading);
      }
    };

    schedule();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);

    const observer = new ResizeObserver(schedule);
    const article = document.querySelector('.doc-content');

    if (article) {
      observer.observe(article);
    }
    return () => {
      anchors.forEach(anchor => anchor.remove());
      cancelAnimationFrame(frame.current);
      observer.disconnect();
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [children, page.url, layout, text.anchor]);

  return { headings, activeHeading };
}
