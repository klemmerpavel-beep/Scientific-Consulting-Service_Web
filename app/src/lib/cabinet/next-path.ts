/**
 * Путь возврата после входа и ссылка «Открыть кабинет» (требование Т-06,
 * решение Р-309).
 *
 * Письмо о событии и сигнал Telegram ведут не на общий `/cabinet`, а на
 * экран события — через обработчик `/cabinet/open`. Без сессии человек
 * входит по ссылке на почту и попадает туда, куда вела ссылка. Путь
 * приходит снаружи — из ссылки, формы, токена, — поэтому пропускается
 * только путь внутри кабинета: иначе возврат после входа стал бы открытым
 * перенаправлением на чужой сайт.
 *
 * Модуль чистый: проверяется встроенным `node --test` без базы.
 */

/** Наибольшая длина пути возврата: длиннее — не путь экрана кабинета. */
const MAX_PATH = 300;

/**
 * Путь внутри кабинета либо `null`.
 *
 * Отвергаются: всё, что не начинается с `/cabinet`; `//` и `\` (браузер
 * читает их как адрес другого узла); `.` и `..` среди частей пути;
 * закодированные разделители и точки (`%2F`, `%5C`, `%2E`) — их
 * раскодирует следующий шаг; управляющие символы; сам обработчик открытия
 * и вход по ссылке — иначе круг.
 */
export function safeNext(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const value = raw.trim();
  if (value.length === 0 || value.length > MAX_PATH) return null;
  if (value !== '/cabinet' && !value.startsWith('/cabinet/') && !value.startsWith('/cabinet?')) return null;
  if (value.includes('//') || value.includes('\\')) return null;
  if (/%(2f|5c|2e|00)/iu.test(value)) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\s]/u.test(value)) return null;
  const pathname = value.split(/[?#]/u)[0]!;
  if (pathname.split('/').some((part) => part === '.' || part === '..')) return null;
  if (pathname === '/cabinet/open' || pathname.startsWith('/cabinet/open/')) return null;
  if (pathname.startsWith('/cabinet/enter')) return null;
  return value;
}

/** Адрес обработчика открытия для экрана `path` — без почты (экраны, Telegram). */
export function openPath(path: string): string {
  const target = safeNext(path) ?? '/cabinet';
  return `/cabinet/open?to=${encodeURIComponent(target)}`;
}

/**
 * Полная ссылка «Открыть кабинет» для письма. Адрес получателя
 * подставляется при отправке и в строке очереди не хранится (Р-217): форма
 * входа покажет его готовым, и ссылку на почту остаётся только запросить.
 */
export function openLink(base: string, path: string, email: string | null): string {
  const tail = email === null ? '' : `&email=${encodeURIComponent(email)}`;
  return `${base.replace(/\/+$/u, '')}${openPath(path)}${tail}`;
}

/** Путь экрана по умолчанию: работа, если она известна, иначе кабинет. */
export function defaultPath(projectCode: string | null): string {
  return projectCode === null ? '/cabinet' : `/cabinet/projects/${projectCode}`;
}

/** Cookie намерения: куда человек шёл и с каким адресом — на 10 минут. */
export const OPEN_COOKIE = 'pd_open';
export const OPEN_COOKIE_SECONDS = 10 * 60;

/** Адрес почты из ссылки письма: только похожий на адрес, иначе `null`. */
export function openEmail(raw: string | null | undefined): string | null {
  const value = (raw ?? '').trim().toLowerCase();
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value) ? value : null;
}

/** Намерение открытия, упакованное в значение cookie. */
export function packOpen(to: string, email: string | null): string {
  return Buffer.from(JSON.stringify({ to: safeNext(to) ?? '/cabinet', email: openEmail(email) }), 'utf8').toString(
    'base64url',
  );
}

/** Намерение из cookie; подделанное или испорченное — `null`. */
export function unpackOpen(raw: string | null | undefined): { to: string; email: string | null } | null {
  if (raw === null || raw === undefined || raw.length === 0 || raw.length > 1024) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as { to?: unknown; email?: unknown };
    const to = typeof parsed.to === 'string' ? safeNext(parsed.to) : null;
    if (to === null) return null;
    return { to, email: typeof parsed.email === 'string' ? openEmail(parsed.email) : null };
  } catch {
    return null;
  }
}
