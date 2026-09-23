import type { ContentPage, Frontmatter, PageData, SiteData } from 'phyllo';

import { type LinkIcon, LINK_ICON_LABELS } from '../components/icon';

import type { AlgoliaOptions } from './use-algolia';

/**
 * 页面布局：首页、文档、普通页面，或 false 表示不输出布局外壳。
 */
export type DocsLayout = 'home' | 'doc' | 'page' | false;

/**
 * 侧边栏分组。
 */
export interface SidebarGroup {
  label: string;
  items: SidebarItem[];
  href?: never;
}

/**
 * 侧边栏文章链接。
 */
export interface SidebarLink {
  href: string;
  label?: string;
  items?: never;
}

/**
 * 侧边栏条目：分组或文章链接。
 */
export type SidebarItem = SidebarGroup | SidebarLink;

/**
 * 解析后的侧边栏文章。
 */
export interface SidebarArticle {
  href: string;
  label: string;
  groups: string[];
}

/**
 * 解析后的侧边栏分组。
 */
export interface ResolvedSidebarGroup {
  label: string;
  items: SidebarEntry[];
}

/**
 * 解析后的侧边栏条目：嵌套分组或文章链接。
 */
export type SidebarEntry = ResolvedSidebarGroup | SidebarArticle;

/**
 * 顶部导航分区，带侧边栏。
 */
export interface NavSection {
  label: string;
  sidebar: SidebarGroup[];
  href?: never;
  items?: never;
}

/**
 * 顶部导航链接。
 */
export interface NavLink {
  label: string;
  href: string;
  sidebar?: never;
  items?: never;
}

/**
 * 顶部导航条目：分区、链接或下拉。
 */
export type NavItem =
  | NavSection
  | NavLink
  | {
      label: string;
      items: (NavSection | NavLink)[];
      sidebar?: never;
      href?: never;
    };

/**
 * 站点数据与首页 frontmatter 中声明的展示配置。
 */
export interface DocsSite extends SiteData {
  logo?: string;
  links?: { icon: LinkIcon; href: string }[];
  nav?: NavItem[];
}

/**
 * 语言范围：语言标签与界面显示名。
 */
export interface DocsLocale {
  lang: string;
  label: string;
}

/**
 * 搜索配置：本地索引或 Algolia。
 */
export type DocsSearch =
  { provider: 'local' } | { provider: 'algolia'; options: AlgoliaOptions };

/**
 * 首页 Hero 配置。
 */
export interface HeroOptions {
  title?: string;
  description?: string;
  image?: { src: string; alt: string };
  actions?: { label: string; href: string }[];
}

/**
 * 文档主题的首页 frontmatter。
 */
export interface DocsFrontmatter
  extends Pick<DocsSite, 'logo' | 'links' | 'nav'>, Frontmatter {
  /** 首页标题，省略时使用站点标题。 */
  title?: string;
  /** 根首页中的语言范围映射，键使用 /zh/ 形式。 */
  locales?: Record<string, DocsLocale>;
  /** 根首页中的搜索配置。省略时跟随站点的本地索引开关。 */
  search?: DocsSearch | false;
  layout?: DocsLayout;
  hero?: HeroOptions;
  features?: { title: string; description: string }[];
}

/**
 * 解析文档主题数据所需的输入。
 */
export interface DocsInput {
  /** 站点级信息。 */
  site: SiteData;
  /** 当前页面。 */
  page: PageData;
  /** 全部内容页面。 */
  pages: readonly ContentPage[];
}

/**
 * 主题内置的界面文案，按语言代码索引。
 */
const UI_TEXT = {
  en: {
    docs: 'Documentation',
    home: 'Overview',
    search: 'Search documentation…',
    searchButton: 'Search',
    close: 'Close search',
    empty: 'No matching pages.',
    searchHint: 'Enter a search term.',
    searchLoading: 'Searching…',
    searchFailed: 'Search is unavailable. Please try again.',
    retry: 'Retry',
    start: 'Get started',
    navigation: 'Main navigation',
    breadcrumb: 'Breadcrumb',
    pagination: 'Article navigation',
    contents: 'On this page',
    anchor: 'Link to section',
    previous: 'Previous',
    next: 'Next',
    menu: 'Documentation menu',
    skip: 'Skip to content',
    language: 'Language',
    dark: 'Switch to dark mode',
    light: 'Switch to light mode',
    callout: {
      note: 'Note',
      tip: 'Tip',
      info: 'Info',
      warning: 'Warning',
      danger: 'Danger',
    },
  },
  zh: {
    docs: '文档',
    home: '概览',
    search: '搜索文档……',
    searchButton: '搜索',
    close: '关闭搜索',
    empty: '没有找到相关页面。',
    searchHint: '输入关键词，查找相关内容。',
    searchLoading: '正在搜索……',
    searchFailed: '搜索暂时不可用，请重试。',
    retry: '重试',
    start: '开始使用',
    navigation: '主导航',
    breadcrumb: '面包屑导航',
    pagination: '上下篇导航',
    contents: '本页内容',
    anchor: '链接到章节',
    previous: '上一篇',
    next: '下一篇',
    menu: '文档目录',
    skip: '跳到正文',
    language: '语言',
    dark: '切换到暗色模式',
    light: '切换到亮色模式',
    callout: {
      note: '说明',
      tip: '提示',
      info: '信息',
      warning: '警告',
      danger: '危险',
    },
  },
};

function within(url: string, prefix: string) {
  return url === prefix || url.startsWith(`${prefix}/`);
}

function hasLabel(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** 语言标签的排序规则。 */
const LANGUAGE_ORDER = new Intl.Collator('en');

/**
 * 解析文档主题所需的站点、导航、语言与搜索数据。
 *
 * @param input - 站点上下文数据。
 * @returns 主题布局使用的数据集合。
 * @throws 站点或页面数据不合法时抛出错误。
 */
export function resolveDocs(input: DocsInput) {
  const { site: root, page, pages: allPages } = input;
  const frontmatter = page.frontmatter as DocsFrontmatter;
  const shared = (allPages.find(article => article.url === '/')?.frontmatter ??
    {}) as DocsFrontmatter;

  if (
    shared.locales !== undefined &&
    (!shared.locales ||
      typeof shared.locales !== 'object' ||
      Array.isArray(shared.locales))
  ) {
    throw new Error(
      'locales must map URL prefixes to lang and label in content/index.mdx.',
    );
  }
  const seen = new Set<string>();
  const locales = Object.entries(shared.locales ?? {}).map(
    ([prefix, value]) => {
      if (
        !/^\/(?:[^/?#]+\/)+$/.test(prefix) ||
        prefix
          .split('/')
          .slice(1, -1)
          .some(segment => {
            try {
              const decoded = decodeURIComponent(segment);

              return (
                decoded === '.' ||
                decoded === '..' ||
                /[/\\]/.test(decoded) ||
                [...decoded].some(character => character.charCodeAt(0) < 32) ||
                encodeURIComponent(decoded) !== segment
              );
            } catch {
              return true;
            }
          })
      ) {
        throw new Error(
          `Invalid locale prefix: ${prefix}. Use an encoded /directory/ prefix.`,
        );
      }

      if (!value || !hasLabel(value.lang) || !hasLabel(value.label)) {
        throw new Error(`Locale ${prefix} requires lang and label.`);
      }
      const lang = new Intl.Locale(value.lang).toString();

      if (seen.has(lang)) {
        throw new Error(`Duplicate locale language: ${lang}.`);
      }
      seen.add(lang);

      return { lang, label: value.label, url: prefix.slice(0, -1) };
    },
  );
  const currentLocale = locales.find(locale => within(page.url, locale.url));
  const home = currentLocale?.url ?? '/';
  const homeData = allPages.find(
    article =>
      article.url === home && /(^|\/)index\.mdx?$/.test(article.filePath),
  );
  const homeNav = (homeData?.frontmatter as DocsFrontmatter | undefined)?.nav;
  const site: DocsSite = {
    ...root,
    logo: shared.logo,
    links: shared.links,
    // 仅缺省时继承公共导航，显式 null 交给数组校验报错。
    nav: homeNav === undefined ? shared.nav : homeNav,
  };
  const lang = currentLocale?.lang ?? root.lang;
  const code = lang ? new Intl.Locale(lang).language : 'en';
  const text = UI_TEXT[code as keyof typeof UI_TEXT] ?? UI_TEXT.en;
  const isHome = page.url === '/' || page.url === homeData?.url;
  const layout =
    frontmatter.layout === undefined
      ? isHome
        ? 'home'
        : 'doc'
      : frontmatter.layout;

  if (layout !== false && !['home', 'doc', 'page'].includes(layout)) {
    throw new Error(`Invalid layout for ${page.url}: ${layout}`);
  }
  const { hero, features } = frontmatter;

  if (
    hero !== undefined &&
    (!hero || typeof hero !== 'object' || Array.isArray(hero))
  ) {
    throw new Error(
      'hero must be an object with title, description, image or actions.',
    );
  }

  if (hero?.title !== undefined && typeof hero.title !== 'string') {
    throw new Error('hero.title must be a string.');
  }

  if (hero?.description !== undefined && typeof hero.description !== 'string') {
    throw new Error('hero.description must be a string.');
  }

  if (
    hero?.image !== undefined &&
    (!hero.image ||
      typeof hero.image.src !== 'string' ||
      typeof hero.image.alt !== 'string')
  ) {
    throw new Error('hero.image requires src and alt.');
  }

  if (
    hero?.actions !== undefined &&
    (!Array.isArray(hero.actions) ||
      hero.actions.some(
        action =>
          !action ||
          typeof action.label !== 'string' ||
          !action.label.trim() ||
          typeof action.href !== 'string' ||
          !action.href.trim(),
      ))
  ) {
    throw new Error('hero.actions requires links with label and href.');
  }

  if (
    features !== undefined &&
    (!Array.isArray(features) ||
      features.some(
        feature =>
          !feature ||
          typeof feature.title !== 'string' ||
          !feature.title.trim() ||
          typeof feature.description !== 'string',
      ))
  ) {
    throw new Error(
      'features must be an array of entries with title and description.',
    );
  }
  const languages = locales
    .map(locale => {
      const url =
        isHome || !currentLocale
          ? locale.url
          : `${locale.url}${page.url.slice(home.length)}`;

      return {
        lang: locale.lang,
        label: locale.label,
        current: locale === currentLocale,
        url: allPages.some(article => article.url === url) ? url : undefined,
      };
    })
    .sort(
      (a, b) =>
        LANGUAGE_ORDER.compare(a.label, b.label) ||
        LANGUAGE_ORDER.compare(a.lang, b.lang),
    );

  if (site.logo !== undefined && !hasLabel(site.logo)) {
    throw new Error('logo must be an image URL.');
  }
  const search =
    shared.search === undefined
      ? root.search
        ? { provider: 'local' as const }
        : false
      : shared.search;

  if (search !== false) {
    if (!search || !['local', 'algolia'].includes(search.provider)) {
      throw new Error('search.provider must be local or algolia.');
    }

    if (search.provider === 'local' && !root.search) {
      throw new Error(
        'Local search requires search: true in phyllo.config.ts.',
      );
    }

    if (
      search.provider === 'algolia' &&
      (!search.options ||
        !['appId', 'apiKey', 'indexName'].every(key =>
          hasLabel(search.options[key as keyof AlgoliaOptions]),
        ))
    ) {
      throw new Error(
        'Algolia search requires appId, apiKey and indexName in search.options.',
      );
    }
  }

  if (site.nav !== undefined && !Array.isArray(site.nav)) {
    throw new Error('nav must be an array of sections, links or dropdowns.');
  }
  const validateHref = (href: string) => {
    // 导航与图标链接只校验地址形式，重定向与公共文件不在内容页面集合中。
    if (!/^(?:\/(?!\/)|[a-z][a-z\d+.-]*:|#|\/\/)/i.test(href)) {
      throw new Error(`Link must be an absolute path or URL: ${href}`);
    }
  };
  const articlesByUrl = new Map(
    allPages.map(article => [article.url, article]),
  );
  const resolveEntry = (entry: NavSection | NavLink) => {
    if (!entry || !hasLabel(entry.label) || 'items' in entry) {
      throw new Error('Nav entries require label and either href or sidebar.');
    }

    if ('href' in entry) {
      if (!hasLabel(entry.href) || 'sidebar' in entry) {
        throw new Error('Nav links require href without sidebar.');
      }
      validateHref(entry.href);

      return { label: entry.label, href: entry.href };
    }

    if (!Array.isArray(entry.sidebar) || !entry.sidebar.length) {
      throw new Error('Nav sections require label and a non-empty sidebar.');
    }
    const pages: SidebarArticle[] = [];
    const resolveGroup = (
      group: SidebarGroup,
      parents: string[] = [],
    ): ResolvedSidebarGroup => {
      if (
        !group ||
        typeof group !== 'object' ||
        !hasLabel(group.label) ||
        !Array.isArray(group.items) ||
        !group.items.length ||
        'href' in group
      ) {
        throw new Error('Sidebar groups require label and non-empty items.');
      }
      const groups = [...parents, group.label];

      return {
        label: group.label,
        items: group.items.map(entry => {
          if (!entry || typeof entry !== 'object') {
            throw new Error('Sidebar items must be links or groups.');
          }

          if ('items' in entry) {
            return resolveGroup(entry as SidebarGroup, groups);
          }

          if (
            typeof entry.href !== 'string' ||
            (entry.label !== undefined && !hasLabel(entry.label))
          ) {
            throw new Error(
              'Sidebar items require href and an optional label.',
            );
          }
          const article = articlesByUrl.get(entry.href);

          if (!article) {
            throw new Error(`Sidebar article not found: ${entry.href}`);
          }
          const link = {
            href: article.url,
            label: entry.label ?? article.title,
            groups,
          };

          pages.push(link);

          return link;
        }),
      };
    };
    const sidebar = entry.sidebar.map(group => resolveGroup(group));
    const [firstPage] = pages;

    return { label: entry.label, href: firstPage!.href, sidebar, pages };
  };
  const nav = (site.nav ?? []).map(entry => {
    if (entry?.items === undefined) {
      return resolveEntry(entry);
    }

    if (
      !hasLabel(entry.label) ||
      !Array.isArray(entry.items) ||
      !entry.items.length ||
      'sidebar' in entry ||
      'href' in entry
    ) {
      throw new Error(
        'Nav dropdowns require label and non-empty items of links or sections.',
      );
    }
    return { label: entry.label, items: entry.items.map(resolveEntry) };
  });
  const entries = nav.flatMap(entry =>
    'items' in entry ? entry.items : [entry],
  );
  const owners = new Map<string, (typeof entries)[number]>();

  for (const chapter of entries) {
    for (const article of chapter.pages ?? []) {
      if (owners.has(article.href)) {
        throw new Error(`Duplicate navigation article: ${article.href}`);
      }
      owners.set(article.href, chapter);
    }
  }

  if (site.links !== undefined && !Array.isArray(site.links)) {
    throw new Error('links must be an array of links with icon and href.');
  }
  site.links?.forEach(link => {
    if (
      !link ||
      !hasLabel(link.icon) ||
      !hasLabel(link.href) ||
      'label' in link
    ) {
      throw new Error('Site links require icon and href, without label.');
    }

    if (!Object.hasOwn(LINK_ICON_LABELS, link.icon)) {
      throw new Error(`Unsupported link icon: ${link.icon}`);
    }
    validateHref(link.href);
  });

  const chapter = owners.get(page.url);
  const activeNav = chapter ?? entries.find(entry => entry.href === page.url);
  const section = isHome ? entries.find(entry => entry.sidebar) : chapter;
  const pages = section?.pages ?? [];

  return {
    site,
    page,
    frontmatter,
    layout,
    languages,
    lang,
    text,
    isHome,
    pages,
    breadcrumbs:
      pages.find(article => article.href === page.url)?.groups ??
      (activeNav ? [activeNav.label] : []),
    nav,
    activeNav,
    sections: section?.sidebar ?? [],
    home,
    searchDirectory: currentLocale ? decodeURIComponent(home.slice(1)) : '',
    search,
  };
}
