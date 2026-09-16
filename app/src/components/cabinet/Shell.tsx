import type { ReactNode } from 'react';

import type { Actor } from '../../lib/cabinet/access.ts';
import { CONTAINER, GUTTER, MONO, SANS, SERIF } from './tokens.ts';

/**
 * Каркас раздела: шапка с вордмарком и навигацией, рабочая область, подвал
 * с реквизитами. Повторяет строение страниц сайта, поэтому переход
 * «сайт → кабинет» не читается как переход в другой продукт.
 */

const ROLE_LABEL: Record<Actor['role'], string> = {
  CLIENT: 'Клиент',
  EXPERT: 'Эксперт',
  MANAGER: 'Менеджер',
  HEAD: 'Руководитель',
};

function Wordmark() {
  return (
    <a
      href="/"
      style={{
        fontFamily: SERIF,
        fontSize: 21,
        fontWeight: 500,
        letterSpacing: '.005em',
        color: 'var(--pd-ink)',
      }}
    >
      PRO<span style={{ color: 'var(--pd-accent)' }}>DISSER</span>
    </a>
  );
}

export interface NavItem {
  readonly href: string;
  readonly label: string;
}

export function navFor(actor: Actor): NavItem[] {
  const settings: NavItem = { href: '/cabinet/settings', label: 'Уведомления' };
  if (actor.role === 'CLIENT') {
    return [
      { href: '/cabinet/projects', label: 'Мои работы' },
      { href: '/cabinet/request', label: 'Новая заявка' },
      settings,
    ];
  }
  if (actor.role === 'EXPERT') {
    return [
      { href: '/cabinet/projects', label: 'Назначенные работы' },
      { href: '/cabinet/payout', label: 'Вознаграждение' },
      settings,
    ];
  }
  const staff: NavItem[] = [
    { href: '/cabinet/manage', label: 'Очередь заявок' },
    { href: '/cabinet/projects', label: 'Проекты' },
  ];
  // Финансовый контур и перенос истории ведёт руководитель: менеджеру эти
  // разделы не показываются.
  if (actor.role === 'HEAD') {
    staff.push({ href: '/cabinet/manage/finance', label: 'Деньги' });
    staff.push({ href: '/cabinet/manage/analytics', label: 'Аналитика' });
    staff.push({ href: '/cabinet/manage/import', label: 'Импорт' });
  }
  return [...staff, settings];
}

export default function Shell({
  actor,
  current,
  children,
}: {
  actor: Actor | null;
  current?: string;
  children: ReactNode;
}) {
  const items = actor === null ? [] : navFor(actor);
  return (
    <>
      <a className="pd-skip" href="#main">
        Перейти к содержанию
      </a>

      <header
        style={{
          background: 'var(--pd-ink-inverse)',
          borderBottom: '1px solid var(--pd-border)',
        }}
      >
        <div
          className="cab-pad"
          style={{
            boxSizing: 'border-box',
            maxWidth: CONTAINER,
            margin: '0 auto',
            padding: `18px ${GUTTER}px`,
            display: 'flex',
            alignItems: 'center',
            gap: 24,
            flexWrap: 'wrap',
          }}
        >
          <Wordmark />

          {items.length === 0 ? null : (
            <nav className="cab-nav" aria-label="Разделы кабинета">
              <ul
                style={{
                  display: 'flex',
                  gap: 20,
                  margin: 0,
                  padding: 0,
                  listStyle: 'none',
                  flexWrap: 'wrap',
                }}
              >
                {items.map((item) => (
                  <li key={item.href}>
                    <a
                      href={item.href}
                      aria-current={current === item.href ? 'page' : undefined}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        minHeight: 44,
                        fontFamily: SANS,
                        fontSize: 15,
                      }}
                    >
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          )}

          {actor === null ? null : (
            <form
              action="/cabinet/exit"
              method="post"
              style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 16 }}
            >
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: 12,
                  letterSpacing: '.06em',
                  textTransform: 'uppercase',
                  color: 'var(--pd-ink-muted)',
                }}
              >
                {ROLE_LABEL[actor.role]}
              </span>
              <button
                type="submit"
                className="cab-btn cab-btn-quiet"
                style={{
                  minHeight: 44,
                  padding: '0 18px',
                  borderRadius: 999,
                  border: '1px solid var(--pd-edge-neutral)',
                  background: 'var(--pd-ink-inverse)',
                  color: 'var(--pd-ink-secondary)',
                  fontFamily: SANS,
                  fontSize: 15,
                  cursor: 'pointer',
                }}
              >
                Выйти
              </button>
            </form>
          )}
        </div>
      </header>

      <main
        id="main"
        className="cab-pad"
        style={{
          boxSizing: 'border-box',
          maxWidth: CONTAINER,
          margin: '0 auto',
          padding: `clamp(32px,4vw,56px) ${GUTTER}px clamp(72px,7vw,112px)`,
        }}
      >
        {children}
      </main>

      <footer
        style={{
          borderTop: '1px solid var(--pd-border)',
          background: 'var(--pd-ink-inverse)',
        }}
      >
        <div
          className="cab-pad"
          style={{
            boxSizing: 'border-box',
            maxWidth: CONTAINER,
            margin: '0 auto',
            padding: `24px ${GUTTER}px`,
            display: 'flex',
            gap: 20,
            flexWrap: 'wrap',
            fontFamily: SANS,
            fontSize: 13,
            color: 'var(--pd-ink-muted)',
          }}
        >
          <span>ООО «РУСДРОН» · ОГРН 1257700248860 · ИНН 9723254250</span>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 20 }}>
            <a href="/offer">Оферта</a>
            <a href="/privacy">Политика обработки данных</a>
          </span>
        </div>
      </footer>
    </>
  );
}
