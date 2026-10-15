import type { ReactNode } from 'react';

export default function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="site-section">
      <div className="site-wrap">
        <h2 className="site-section-title">{title}</h2>
        <div className="site-body">{children}</div>
      </div>
    </section>
  );
}
