import { type ReactNode, useId, useRef } from 'react';

import { Icon } from '../icon';

import './style.css';

/**
 * 可键盘操作的下拉菜单，使用 Popover API 展开。
 */
export function Dropdown({
  label,
  icon,
  active,
  children,
}: {
  label: string;
  icon?: ReactNode;
  active?: boolean;
  children: ReactNode;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLUListElement>(null);
  const keyboard = useRef(false);

  return (
    <div
      className="dropdown"
      onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          menu.current?.hidePopover();
        }
      }}
      onKeyDown={event => {
        if (event.key === 'Tab') {
          keyboard.current = true;
        }

        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
          return;
        }
        keyboard.current = true;
        event.preventDefault();

        if (!menu.current!.matches(':popover-open')) {
          menu.current!.showPopover();
        }
        const links = Array.from(
          menu.current!.querySelectorAll<HTMLAnchorElement>('a[href]'),
        );
        const index = links.indexOf(event.target as HTMLAnchorElement);
        const next =
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? links.length - 1
              : event.key === 'ArrowDown'
                ? (index + 1) % links.length
                : index < 0
                  ? links.length - 1
                  : (index - 1 + links.length) % links.length;

        links[next]?.focus();
      }}
    >
      <button
        ref={trigger}
        className={`header-control${icon ? ' icon-button' : ''}`}
        type="button"
        popoverTarget={id}
        style={{ anchorName: `--dropdown-${id}` }}
        aria-label={icon ? label : undefined}
        aria-controls={id}
        data-active={active || undefined}
        onClick={event => {
          keyboard.current = event.detail === 0;
        }}
      >
        {icon ? (
          icon
        ) : (
          <>
            {label}
            <Icon name="chevron-down" />
          </>
        )}
      </button>
      <ul
        ref={menu}
        id={id}
        className="dropdown-menu"
        popover="auto"
        style={{ positionAnchor: `--dropdown-${id}` }}
        aria-label={label}
        onClick={event => {
          if ((event.target as HTMLElement).closest('a[href]')) {
            menu.current?.hidePopover();
          }
        }}
        onToggle={event => {
          if (
            event.newState === 'closed' &&
            !keyboard.current &&
            document.activeElement === trigger.current
          ) {
            trigger.current?.blur();
          }
        }}
      >
        {children}
      </ul>
    </div>
  );
}
