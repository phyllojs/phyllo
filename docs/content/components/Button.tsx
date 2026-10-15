/**
 * 首页与正文中的操作按钮，primary 使用强调色。样式由 custom.css 的 .site-link 定义。
 */
export default function Button({
  href,
  label,
  primary = false,
}: {
  href: string;
  label: string;
  primary?: boolean;
}) {
  return (
    <a className={primary ? 'site-link is-primary' : 'site-link'} href={href}>
      {label}
      <span className="icon icon-arrow" aria-hidden="true" />
    </a>
  );
}
