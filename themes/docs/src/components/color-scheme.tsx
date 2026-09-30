import { useEffect, useLayoutEffect, useState } from 'react';

import { Icon } from './icon';

/** 服务端渲染时回退到 useEffect，避免 useLayoutEffect 警告。 */
const useIsomorphicLayoutEffect =
  typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** 保存明暗设置的 localStorage 键名。 */
const COLOR_SCHEME_KEY = 'color-scheme';

/** 在样式解析前恢复明暗设置的内联脚本。 */
export const COLOR_SCHEME_SCRIPT = [
  'try {',
  `  const scheme = localStorage.getItem('${COLOR_SCHEME_KEY}');`,
  "  if (scheme === 'light' || scheme === 'dark') {",
  '    document.documentElement.dataset.colorScheme = scheme;',
  '  }',
  '} catch {}',
].join('\n');

/**
 * 明暗模式切换按钮。
 */
export function ColorSchemeToggle({
  dark,
  light,
}: {
  dark: string;
  light: string;
}) {
  const [isDark, setIsDark] = useState(false);

  useIsomorphicLayoutEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const update = () => {
      const scheme = document.documentElement.dataset.colorScheme;

      setIsDark(scheme ? scheme === 'dark' : media.matches);
    };

    update();
    media.addEventListener('change', update);

    return () => media.removeEventListener('change', update);
  }, []);

  return (
    <button
      className="header-control icon-button"
      type="button"
      aria-label={isDark ? light : dark}
      onClick={() => {
        const scheme = isDark ? 'light' : 'dark';

        document.documentElement.dataset.colorScheme = scheme;
        setIsDark(!isDark);

        try {
          localStorage.setItem(COLOR_SCHEME_KEY, scheme);
        } catch {
          // 保存失败时仍保留当前页面的明暗设置。
        }
      }}
    >
      <Icon name={isDark ? 'sun' : 'moon'} />
    </button>
  );
}
