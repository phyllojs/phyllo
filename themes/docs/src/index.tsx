import Layout from './layout';

import './style.css';

export default Layout;

export { Callout } from './components/callout';
export { Features, Hero } from './components/home';

export type { LinkIcon } from './components/icon';
export type {
  DocsFrontmatter,
  DocsLocale,
  DocsSearch,
  DocsSite,
  HeroOptions,
  NavItem,
  NavLink,
  NavSection,
  SidebarGroup,
  SidebarItem,
  SidebarLink,
} from './hooks/docs-data';
export type { LayoutProps } from './layout';
