import { type ReactNode, Children, isValidElement } from 'react';

import Button from './Button';

export default function Row({
  title,
  href,
  label,
  reverse = false,
  children,
}: {
  title: string;
  href: string;
  label: string;
  reverse?: boolean;
  children: ReactNode;
}) {
  const items = Children.toArray(children);
  const found = items.findIndex(
    item => isValidElement(item) && item.type === 'pre',
  );
  const codeIndex = found === -1 ? items.length - 1 : found;
  const code = items[codeIndex];
  const text = items.filter((_, index) => index !== codeIndex);

  return (
    <div className={reverse ? 'site-row is-reverse' : 'site-row'}>
      <div className="site-row-text">
        <h3 className="site-row-title">{title}</h3>
        {text}
        <Button href={href} label={label} />
      </div>
      <div className="site-row-code">{code}</div>
    </div>
  );
}
