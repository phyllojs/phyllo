import './style.css';

/**
 * 站点链接图标对应的可访问名称。
 */
export const LINK_ICON_LABELS = {
  github: 'GitHub',
  gitlab: 'GitLab',
  gitee: 'Gitee',
  npm: 'npm',
  discord: 'Discord',
  slack: 'Slack',
  telegram: 'Telegram',
  x: 'X',
  bluesky: 'Bluesky',
  youtube: 'YouTube',
  bilibili: 'Bilibili',
  rss: 'RSS',
  email: 'Email',
  qq: 'QQ',
} as const;

/**
 * 站点链接支持的图标。
 */
export type LinkIcon = keyof typeof LINK_ICON_LABELS;

/**
 * 主题内置的图标名称。
 */
type IconName =
  | LinkIcon
  | 'search'
  | 'sun'
  | 'moon'
  | 'language'
  | 'arrow'
  | 'close'
  | 'check'
  | 'plus'
  | 'minus'
  | 'chevron-down';

/**
 * 渲染 Remix Icon 图标字形。
 */
export function Icon({ name }: { name: IconName }) {
  return <span className={`icon icon-${name}`} aria-hidden="true" />;
}
