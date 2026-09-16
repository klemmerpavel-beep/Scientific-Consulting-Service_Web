/**
 * Переключатель вкладок аналитики. Обычные ссылки, а не состояние на
 * стороне браузера: вкладка должна открываться по адресу, показываться
 * в истории и жить без выполнения сценариев.
 */

import { RADIUS, SANS } from './tokens';

export const ANALYTICS_TABS = [
  { href: '/cabinet/manage/analytics', label: 'Обзор' },
  { href: '/cabinet/manage/analytics/money', label: 'Деньги' },
  { href: '/cabinet/manage/analytics/clients', label: 'Клиенты' },
  { href: '/cabinet/manage/analytics/products', label: 'Продукты' },
  { href: '/cabinet/manage/analytics/projects', label: 'Сроки' },
  { href: '/cabinet/manage/analytics/losses', label: 'Потери' },
] as const;

export default function AnalyticsTabs({ current }: { current: string }) {
  return (
    <nav aria-label="Разделы аналитики" style={{ marginBottom: 24 }}>
      <ul
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          listStyle: 'none',
          margin: 0,
          padding: 0,
        }}
      >
        {ANALYTICS_TABS.map((tab) => {
          const active = tab.href === current;
          return (
            <li key={tab.href}>
              <a
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  minHeight: 44,
                  padding: '0 18px',
                  borderRadius: RADIUS.pill,
                  fontFamily: SANS,
                  fontSize: 15,
                  fontWeight: 500,
                  border: `1px solid ${active ? 'var(--pd-accent)' : 'var(--pd-border)'}`,
                  background: active ? 'var(--pd-accent-tint)' : 'var(--pd-ink-inverse)',
                  color: active ? 'var(--pd-accent)' : 'var(--pd-ink-secondary)',
                }}
              >
                {tab.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
