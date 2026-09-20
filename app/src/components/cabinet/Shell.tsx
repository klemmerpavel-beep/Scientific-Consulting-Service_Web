import type { ReactNode } from 'react';

import type { Actor } from '../../lib/cabinet/access.ts';
import { BUTTON_QUIET, CONTAINER, GUTTER, MONO, SANS, SERIF } from './tokens.ts';

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

/**
 * Логотип — тот же, что в шапке сайта: `PRO` акцентным синим, `DISSER`
 * основным цветом текста, Literata 600, кегль 21. Кабинет раньше показывал
 * его наоборот, и раздел читался как чужой продукт под похожим именем.
 * Написание логотипа задаётся макетами сайта (`design/*.dc.html`,
 * блок `.sp-logo`); здесь оно повторено, а не придумано заново.
 */
function Wordmark() {
  return (
    <a
      href="/"
      className="cab-wordmark"
      aria-label="ProDisser — на главную"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        minHeight: 44,
        flex: '0 0 auto',
        padding: '6px 10px',
        margin: '0 -10px',
        borderRadius: 10,
        fontFamily: SERIF,
        fontSize: 23,
        lineHeight: 1.24,
        fontWeight: 600,
        letterSpacing: '.005em',
        textDecoration: 'none',
      }}
    >
      <span style={{ color: 'var(--pd-accent)' }}>PRO</span>
      <span style={{ color: 'var(--pd-ink)' }}>DISSER</span>
    </a>
  );
}

export interface NavItem {
  readonly href: string;
  readonly label: string;
}

/**
 * Разделы роли.
 *
 * Первый ряд навигации занят работой: у клиента — его работы, у штатных
 * ролей — то, что требует вмешательства, работы, деньги и аналитика.
 * Служебный контур в этот ряд не выносится (решение Р-140) и собран за
 * одним пунктом «Управление» (решение Р-158): перенос книги заказов,
 * журналы, очередь уведомлений, учётные записи, справочники, реестры,
 * удаление данных субъекта.
 */
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
  // Главный экран у ролей разный по существу: руководителю — сводка
  // практики с деньгами, менеджеру — то, что требует вмешательства по его
  // работам (решение Р-149). Маршрут один, название честное для каждой.
  const staff: NavItem[] = [
    { href: '/cabinet/manage', label: actor.role === 'HEAD' ? 'Сводка' : 'Требует внимания' },
    { href: '/cabinet/projects', label: 'Работы' },
  ];
  if (actor.role === 'HEAD') {
    staff.push({ href: '/cabinet/manage/finance', label: 'Деньги' });
    staff.push({ href: '/cabinet/manage/analytics', label: 'Аналитика' });
  }
  // Служебный контур — реестры, учётные записи, справочники, перенос книги,
  // журналы, очередь уведомлений, удаление данных — собран за одним пунктом
  // (решение Р-158). В первый ряд эти разделы не выносятся по Р-140: они
  // нужны изредка. Но и доступными только по набранному вручную адресу они
  // быть не должны — о них тогда знает лишь тот, кто писал код.
  staff.push({ href: '/cabinet/manage/tools', label: 'Управление' });
  return [...staff, settings];
}

export default function Shell({
  actor,
  current,
  center = false,
  board = false,
  children,
}: {
  actor: Actor | null;
  current?: string;
  /**
   * Содержимое стоит по центру оставшейся высоты. Нужно экрану входа: там
   * одна форма, и прижатая к верху она читается обрывком страницы. Обычные
   * экраны длиннее окна, и центрировать в них нечего (решение Р-166).
   */
  center?: boolean;
  /**
   * Панель: готовность, план, материалы и переписка стоят рядом, а не
   * лентой (решение Р-169).
   *
   * Прежде панель занимала ровно окно и не прокручивалась вовсе. При окне
   * ниже девятисот пикселей это ужимало колонки до нечитаемого — тело
   * переписки выходило в тридцать два пикселя, полторы строки плана, — а
   * форма отправки выдавливалась из карточки и налезала на свёртку под
   * ней. Теперь высота колонки ограничена сверху, но не снизу: короткое
   * содержимое видно целиком, длинное прокручивается внутри, а страница
   * получает небольшую прокрутку (решение Р-180).
   *
   * Отступы `clamp` рассчитаны на страницу-ленту, где под последним блоком
   * нужен воздух; панели столько не нужно, и на ней отступы ровнее.
   */
  board?: boolean;
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
            padding: `24px ${GUTTER}px`,
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
              <button type="submit" className="cab-btn cab-btn-quiet" style={BUTTON_QUIET}>
                Выйти
              </button>
            </form>
          )}
        </div>
      </header>

      <main
        id="main"
        className={board ? 'cab-pad cab-board-main' : 'cab-pad'}
        style={{
          boxSizing: 'border-box',
          width: '100%',
          maxWidth: CONTAINER,
          margin: '0 auto',
          padding: board
            ? `24px ${GUTTER}px 40px`
            : `clamp(32px,4vw,56px) ${GUTTER}px clamp(72px,7vw,112px)`,
          ...(center
            ? { display: 'flex', alignItems: 'center', justifyContent: 'center' }
            : {}),
          ...(board ? { display: 'flex', flexDirection: 'column' } : {}),
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
          {/* Реквизиты общества стоят в подвале сайта, где они и требуются
              законом. В закрытом разделе человек уже знает, с кем работает,
              и строка занимает место без пользы. */}
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 20 }}>
            <a href="/offer">Оферта</a>
            <a href="/privacy">Политика обработки данных</a>
          </span>
        </div>
      </footer>
    </>
  );
}
