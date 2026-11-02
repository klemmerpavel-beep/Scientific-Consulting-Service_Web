/**
 * Выбор посетителя о счётчике посещаемости (решения Р-250, Р-773).
 *
 * Выбор «Разрешить» или «Отказаться» хранится в браузере посетителя под
 * ключом `pd-analytics` и никуда не передаётся. Ссылка «Настройки cookies»
 * в подвале содержательных страниц и страницы 404 стирает выбор, и
 * уведомление появляется снова: так согласие можно отозвать в любой момент,
 * а не только очисткой данных сайта средствами браузера (Политика 1.1,
 * раздел «Файлы cookies и веб-аналитика»).
 *
 * Модуль без React и без обращения к `window`: хранилище и событие
 * передаются параметрами, поэтому поведение проверяется в `npm test` без
 * браузера (`app/tests/cookie-settings.test.ts`).
 */

/** Ключ выбора посетителя в `localStorage`. */
export const CHOICE_KEY = 'pd-analytics';

/**
 * Ссылка «Настройки cookies» в подвале. Без включённого счётчика её никто
 * не перехватывает, и она ведёт в раздел политики о cookies.
 */
export const SETTINGS_LINK = 'a[data-pd-cookies]';

export type Choice = 'yes' | 'no' | null;

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;

/** Сохранённый выбор; частное окно или запрещённые данные сайта — выбора нет. */
export function readChoice(store: Store | null | undefined): Choice {
  try {
    const v = store?.getItem(CHOICE_KEY);
    return v === 'yes' || v === 'no' ? v : null;
  } catch {
    return null;
  }
}

/**
 * Запоминает выбор. Если записать не удалось, уведомление появится снова
 * при следующем посещении — это лучше, чем считать согласие полученным без
 * возможности его подтвердить.
 */
export function saveChoice(store: Store | null | undefined, v: Exclude<Choice, null>): void {
  try {
    store?.setItem(CHOICE_KEY, v);
  } catch {
    // Хранилище недоступно: выбор действует только до ухода со страницы.
  }
}

/** Стирает выбор: уведомление показывается снова, счётчик не запускается. */
export function forgetChoice(store: Store | null | undefined): void {
  try {
    store?.removeItem(CHOICE_KEY);
  } catch {
    // Хранилище недоступно — стирать нечего.
  }
}

type SettingsClick = {
  defaultPrevented: boolean;
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  target: EventTarget | null;
  preventDefault(): void;
};

/**
 * Обработчик нажатия на «Настройки cookies»: если нажата эта ссылка, без
 * клавиш-модификаторов, переход отменяется, выбор стирается и возвращается
 * `true` — компонент снова показывает уведомление. Нажатие с модификатором
 * (открыть в новой вкладке) оставлено браузеру: откроется раздел политики.
 */
export function openCookieSettings(event: SettingsClick, store: Store | null | undefined): boolean {
  if (event.defaultPrevented || event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  const target = event.target as { closest?: (selector: string) => unknown } | null;
  if (!target || typeof target.closest !== 'function' || !target.closest(SETTINGS_LINK)) return false;
  event.preventDefault();
  forgetChoice(store);
  return true;
}

/**
 * Стирает файлы cookies и записи хранилища, которые счётчик оставил на
 * адресе сайта (имена начинаются с `_ym`), — при отказе после согласия.
 * Метрика ставит cookies на домен второго уровня, поэтому стираются все
 * варианты домена. Ключ выбора посетителя этим не затрагивается.
 */
export function dropCounterData(
  doc: { cookie: string },
  store: Store | null | undefined,
  hostname: string,
): void {
  const parts = hostname.split('.');
  const domains = ['', hostname, `.${hostname}`];
  if (parts.length > 2) domains.push(`.${parts.slice(-2).join('.')}`);
  const names = doc.cookie
    .split(';')
    .map((pair) => pair.split('=')[0].trim())
    .filter((name) => name.startsWith('_ym'));
  for (const name of names) {
    for (const domain of domains) {
      doc.cookie = `${name}=; Max-Age=0; path=/${domain ? `; domain=${domain}` : ''}`;
    }
  }
  try {
    if (!store) return;
    const keys: string[] = [];
    for (let i = 0; i < store.length; i += 1) {
      const key = store.key(i);
      if (key && key.startsWith('_ym')) keys.push(key);
    }
    for (const key of keys) store.removeItem(key);
  } catch {
    // Хранилище недоступно — счётчик туда и не писал.
  }
}
