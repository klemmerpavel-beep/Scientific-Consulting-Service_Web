import { hasContacts } from './cabinet/contacts.ts';

/**
 * Замечания с виджета: правила без базы и без сети (решение Р-403).
 *
 * На время запуска сайта и кабинета руководитель и клиенты отправляют
 * замечания кнопкой справа внизу; раз в неделю по ним делаются точечные
 * правки. Главное требование заказчика — виджет не собирает персональных
 * данных. Оно держится здесь, на сервере: путь страницы сводится к
 * шаблону без идентификаторов, текст с контактом не принимается, снимок
 * экрана разрешён только на публичных страницах. Клиенту эти правила не
 * доверяются — браузер показывает человеку тот же шаблон, но записывается
 * то, что посчитал сервер.
 *
 * Модуль чистый: его же берёт виджет в браузере, чтобы показать строку
 * «Страница: …» ровно такой, какой она ляжет в таблицу.
 */

export type FeedbackArea = 'SITE' | 'CABINET';
export type FeedbackSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type FeedbackStatus = 'NEW' | 'IN_WORK' | 'FIXED' | 'REJECTED';

export const FEEDBACK_SEVERITIES: readonly FeedbackSeverity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
export const FEEDBACK_STATUSES: readonly FeedbackStatus[] = ['NEW', 'IN_WORK', 'FIXED', 'REJECTED'];

export const SEVERITY_LABEL: Record<FeedbackSeverity, string> = {
  CRITICAL: 'критично',
  HIGH: 'высокая',
  MEDIUM: 'средняя',
  LOW: 'низкая',
};

export const STATUS_LABEL: Record<FeedbackStatus, string> = {
  NEW: 'новое',
  IN_WORK: 'в работе',
  FIXED: 'исправлено',
  REJECTED: 'отклонено',
};

export const AREA_LABEL: Record<FeedbackArea, string> = {
  SITE: 'сайт',
  CABINET: 'кабинет',
};

/** Закрытые состояния: при переходе в них ставится момент закрытия. */
export const CLOSED_STATUSES: ReadonlySet<FeedbackStatus> = new Set(['FIXED', 'REJECTED']);

export const TEXT_MIN = 3;
export const TEXT_MAX = 5000;
export const NOTE_MAX = 2000;
/** Снимок — до 5 МБ; тело запроса целиком — до 6 МБ, с запасом на поля. */
export const SCREENSHOT_MAX_BYTES = 5 * 1024 * 1024;
export const BODY_MAX_BYTES = 6 * 1024 * 1024;
/**
 * Быстрее человек форму не заполнит: отправку раньше этого срока после
 * открытия окна принимаем молча и не сохраняем — как ловушку в формах
 * заявки (`lead-schema.ts`, `looksAutomated`).
 */
export const MIN_ELAPSED_MS = 1200;

export const TEXT_TOO_SHORT = 'Опишите замечание хотя бы парой слов.';
export const TEXT_TOO_LONG = `Замечание длиннее ${TEXT_MAX} знаков — сократите его.`;
export const TEXT_HAS_CONTACTS =
  'Уберите из замечания телефон, почту или ссылку на мессенджер: виджет не собирает персональные данные.';
export const TEXT_HINT = 'Не указывайте имя, телефон и почту — опишите, что не так и где.';
export const RATE_LIMIT_MESSAGE = 'Слишком много замечаний подряд — попробуйте через несколько минут.';
export const SCREENSHOT_IN_CABINET =
  'Снимок экрана прикладывается только на страницах сайта: на экранах кабинета видны персональные данные.';
export const SCREENSHOT_TOO_BIG = 'Снимок больше 5 МБ — уменьшите его или отправьте замечание без снимка.';
export const SCREENSHOT_BAD_TYPE = 'Снимок принимается только картинкой PNG, JPEG или WEBP.';
export const THANKS = 'Спасибо, замечание записано.';

/**
 * Включён ли виджет. Читается при сборке, как номер Метрики: `off` — кнопки
 * нет нигде и приём отвечает 404; любое другое значение или его отсутствие —
 * включено. Выключатель нужен, чтобы снять виджет после запуска, не трогая
 * кода (решение Р-403).
 */
export function feedbackEnabled(value: string | undefined = process.env.NEXT_PUBLIC_FEEDBACK_WIDGET): boolean {
  return (value ?? '').trim().toLowerCase() !== 'off';
}

// ───────────────────────────── Страница ──────────────────────────────────

/** Кабинет — `/cabinet` и всё под ним; `/cabinet-preview` — уже сайт. */
export function areaOf(path: string): FeedbackArea {
  const clean = stripPath(path);
  return clean === '/cabinet' || clean.startsWith('/cabinet/') ? 'CABINET' : 'SITE';
}

/** Путь без источника, строки запроса и якоря; лишние косые черты сведены. */
function stripPath(raw: string): string {
  let value = String(raw ?? '').trim();
  // Пришёл полный адрес — берём из него путь. Источник в шаблон не идёт:
  // он один и тот же, а чужой источник — просто мусор.
  const scheme = /^[a-z][a-z0-9+.-]*:\/\/[^/?#]*/iu.exec(value);
  if (scheme !== null) value = value.slice(scheme[0].length);
  value = value.split(/[?#]/u)[0] ?? '';
  value = value.replace(/\/{2,}/gu, '/');
  if (!value.startsWith('/')) value = `/${value}`;
  if (value.length > 1 && value.endsWith('/')) value = value.slice(0, -1);
  return value;
}

/**
 * Разделы, за которыми в адресе стоит идентификатор записи. Кодом работы
 * считается и сегмент после `projects`: работы из перенесённой книги
 * заказов могут носить код не по образцу `PD-…`.
 */
const ID_AFTER: ReadonlySet<string> = new Set(['stages', 'leads', 'import', 'files', 'lead-files']);
/** Служебные адреса внутри разделов с идентификатором — их оставляем. */
const KEEP_AFTER_ID_PARENT: ReadonlySet<string> = new Set(['export', 'new']);

/** Сегмент обычного адреса: строчная латиница, цифры, точка и дефис. */
const SLUG = /^[a-z][a-z0-9._-]{0,39}$/u;

/**
 * Шаблон пути страницы: то, что записывается вместо адреса.
 *
 * В адресе кабинета стоят ключ входа (`/cabinet/enter/<ключ>`), коды работ
 * и идентификаторы записей — по ним замечание связывается с человеком.
 * Остаются только названия разделов. На публичных страницах адресов с
 * идентификаторами нет, но несуществующий адрес человек набирает сам, и в
 * нём бывает что угодно, вплоть до номера телефона: всё, что не похоже на
 * название раздела, заменяется меткой. Строка запроса и якорь не
 * записываются вовсе — в строке поиска реестров бывают ФИО и телефоны
 * (решение Р-403; та же причина, по которой кабинет закрыт от Метрики,
 * Р-250).
 */
export function pathTemplate(raw: string): string {
  const clean = stripPath(raw);
  if (clean === '/') return '/';
  const cabinet = areaOf(clean) === 'CABINET';
  const parts = clean.split('/').slice(1, 11);
  const out: string[] = [];
  for (let i = 0; i < parts.length; i += 1) {
    const segment = parts[i] ?? '';
    const parent = parts[i - 1] ?? '';
    out.push(templateSegment(segment, parent, cabinet));
  }
  return `/${out.join('/')}`;
}

/** Метки шаблона. Виджет присылает уже сведённый путь, и второй проход его не меняет. */
const MARKS: ReadonlySet<string> = new Set(['[id]', '[код]', '[ссылка]']);

function templateSegment(segment: string, parent: string, cabinet: boolean): string {
  if (MARKS.has(segment)) return segment;
  if (/^PD-/iu.test(segment)) return '[код]';
  if (cabinet && parent === 'enter') return '[ссылка]';
  if (cabinet && parent === 'projects') return '[код]';
  if (cabinet && ID_AFTER.has(parent) && !KEEP_AFTER_ID_PARENT.has(segment)) return '[id]';
  if (looksLikeId(segment)) return '[id]';
  if (!SLUG.test(segment)) return '[id]';
  return segment;
}

/**
 * Похоже ли на идентификатор: длинная строка из латиницы и цифр (cuid,
 * свёртка), смесь букв и цифр от 12 знаков (uuid, ключ), либо шесть и
 * больше цифр — так выглядит набранный в адресе телефон.
 */
export function looksLikeId(segment: string): boolean {
  if (/^[a-z0-9]{16,}$/iu.test(segment)) return true;
  if (segment.length >= 12 && /\p{L}/u.test(segment) && /\d/u.test(segment)) return true;
  if ((segment.match(/\d/gu) ?? []).length >= 6) return true;
  return false;
}

// ───────────────────────────── Устройство ────────────────────────────────

/** Ширина окна: целое от 200 до 10000, иначе неизвестна. */
export function parseWidth(raw: unknown): number | null {
  const text = typeof raw === 'number' ? String(raw) : typeof raw === 'string' ? raw.trim() : '';
  if (!/^\d{1,5}$/u.test(text)) return null;
  const width = Number(text);
  return width >= 200 && width <= 10000 ? width : null;
}

/** Устройство по ширине окна — те же границы, что у раскладок сайта и кабинета. */
export function deviceOf(width: number | null): string {
  if (width === null) return 'не определено';
  if (width < 768) return 'телефон';
  if (width < 1100) return 'планшет';
  return 'компьютер';
}

// ───────────────────────────── Критичность ───────────────────────────────

interface Rule {
  readonly phrase: string;
  /** Слово целиком: «не та» не должно ловить «не так». */
  readonly whole?: boolean;
}

const rules = (...items: (string | Rule)[]): readonly Rule[] =>
  items.map((item) => (typeof item === 'string' ? { phrase: item } : item));

const CRITICAL = rules(
  'не работает', 'не открывается', 'не отправ', 'не загруж', 'не сохран', 'не могу войти',
  'не пускает', 'ошибка 500', 'сбой', 'пропал', 'потерял', 'удалил', 'белый экран', 'зависает',
  'не приходит ссылка',
);
/** В кабинете о деньгах — всегда критично: ошибка в сумме стоит дороже прочих. */
const CRITICAL_CABINET = rules('оплат', 'деньг', 'сумм');
// «Ошибк» — основой, а не словом «ошибка»: «показывает ошибки» значит то же.
const HIGH = rules(
  'ошибк', 'не видно', 'не отображ', 'неправильн', 'неверн',
  { phrase: 'не тот', whole: true }, { phrase: 'не та', whole: true },
  'налезает', 'обрез', 'съехал', 'не нажимается', 'не кликается', 'долго грузится',
);
const LOW = rules(
  'опечатка', 'предлагаю', 'хорошо бы', 'было бы удобно', 'мелочь', 'пожелание', 'цвет', 'шрифт',
);
/** Вход в кабинет: замечание отсюда значит, что человек, возможно, не может войти. */
const LOGIN_TEMPLATES: ReadonlySet<string> = new Set(['/cabinet', '/cabinet/enter/[ссылка]']);

/** Текст для сверки: строчные, «ё» как «е», пробелы сведены к одному. */
export function foldText(text: string): string {
  return text.toLowerCase().replace(/ё/gu, 'е').replace(/\s+/gu, ' ');
}

function hit(folded: string, list: readonly Rule[]): boolean {
  return list.some((rule) => {
    let from = 0;
    for (;;) {
      const at = folded.indexOf(rule.phrase, from);
      if (at < 0) return false;
      // Граница слова — по букве, а не `\b`: та опирается на латиницу.
      const before = at === 0 ? '' : folded[at - 1]!;
      const after = folded[at + rule.phrase.length] ?? '';
      const startOk = !/\p{L}/u.test(before);
      const endOk = rule.whole !== true || !/\p{L}/u.test(after);
      if (startOk && endOk) return true;
      from = at + 1;
    }
  });
}

/**
 * Критичность по правилам при отправке (решение Р-403). Руководитель
 * уточняет её на разборе, правило лишь ставит замечание в очередь: «не
 * работает» поднимается наверх раньше, чем «хорошо бы поменять шрифт».
 * Порядок проверки — от тяжёлого к лёгкому, первое сработавшее правило
 * решает.
 */
export function autoSeverity(text: string, area: FeedbackArea, template: string): FeedbackSeverity {
  const folded = foldText(text);
  if (hit(folded, CRITICAL)) return 'CRITICAL';
  if (area === 'CABINET' && hit(folded, CRITICAL_CABINET)) return 'CRITICAL';
  if (hit(folded, HIGH)) return 'HIGH';
  if (LOGIN_TEMPLATES.has(template)) return 'HIGH';
  if (hit(folded, LOW)) return 'LOW';
  return 'MEDIUM';
}

// ───────────────────────────── Снимок ────────────────────────────────────

export interface ImageKind {
  readonly ext: 'png' | 'jpg' | 'webp';
  readonly type: 'image/png' | 'image/jpeg' | 'image/webp';
}

/**
 * Тип картинки по первым байтам. Заголовок `Content-Type` и расширение
 * задаёт отправитель, и под видом снимка можно прислать разметку: верим
 * только сигнатуре.
 */
export function sniffImage(bytes: Uint8Array): ImageKind | null {
  const at = (i: number) => bytes[i];
  if (
    bytes.length >= 8 &&
    at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47 &&
    at(4) === 0x0d && at(5) === 0x0a && at(6) === 0x1a && at(7) === 0x0a
  ) {
    return { ext: 'png', type: 'image/png' };
  }
  if (bytes.length >= 3 && at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) {
    return { ext: 'jpg', type: 'image/jpeg' };
  }
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (bytes.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') {
    return { ext: 'webp', type: 'image/webp' };
  }
  return null;
}

/**
 * Отказ приёма с причиной для человека; `status` — код ответа маршрута.
 * Лежит здесь, а не в службе: маршрут приёма различает отказы, не
 * подключая базу (решение Р-403).
 */
export class FeedbackInputError extends Error {
  readonly status: number;

  constructor(message: string, status = 422) {
    super(message);
    this.name = 'FeedbackInputError';
    this.status = status;
  }
}

// ───────────────────────────── Разбор отправки ───────────────────────────

export interface PreparedFeedback {
  readonly area: FeedbackArea;
  readonly pathTemplate: string;
  readonly text: string;
  readonly device: string;
  readonly viewportWidth: number | null;
  readonly severityAuto: FeedbackSeverity;
}

export type Prepared =
  | { readonly ok: true; readonly value: PreparedFeedback }
  | { readonly ok: false; readonly error: string };

/**
 * Проверить и свести к записи то, что прислал виджет. Ни одно значение не
 * берётся на веру: область и шаблон считаются из пути, устройство — из
 * ширины, критичность — из текста.
 */
export function prepareFeedback(input: { text: unknown; path: unknown; width: unknown }): Prepared {
  // Нулевой знак PostgreSQL в тексте не принимает: запись упала бы сбоем
  // базы вместо внятного ответа.
  const text = String(input.text ?? '').replace(/\u0000/gu, '').trim();
  if (text.length < TEXT_MIN) return { ok: false, error: TEXT_TOO_SHORT };
  if (text.length > TEXT_MAX) return { ok: false, error: TEXT_TOO_LONG };
  if (hasContacts(text)) return { ok: false, error: TEXT_HAS_CONTACTS };

  const path = typeof input.path === 'string' ? input.path : '/';
  const template = pathTemplate(path);
  const area = areaOf(path);
  const width = parseWidth(input.width);
  return {
    ok: true,
    value: {
      area,
      pathTemplate: template,
      text,
      device: deviceOf(width),
      viewportWidth: width,
      severityAuto: autoSeverity(text, area, template),
    },
  };
}

export function isSeverity(value: unknown): value is FeedbackSeverity {
  return typeof value === 'string' && (FEEDBACK_SEVERITIES as readonly string[]).includes(value);
}

export function isStatus(value: unknown): value is FeedbackStatus {
  return typeof value === 'string' && (FEEDBACK_STATUSES as readonly string[]).includes(value);
}
