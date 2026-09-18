/**
 * Готовность кабинета к работе.
 *
 * Слияние в `main` обновляет боевой сервер само (решение Р-151), и кабинет
 * уезжает туда вместе с остальным сайтом. Без своих настроек он не просто
 * не работает — он падает: свёртка токенов требует `SESSION_SECRET`,
 * материалы негде хранить без `CABINET_STORAGE_DIR`, выборки невозможны
 * без базы. Посетитель получал бы ошибку сервера на живом сайте.
 *
 * Поэтому раздел сначала спрашивает, готов ли он, и при незаданных
 * настройках показывает честную страницу «готовится» вместо пятисотой
 * ошибки. Проверка дешёвая — чтение переменных окружения, — и делается
 * один раз в каркасе раздела.
 */

/** Настройки, без которых кабинет не поднимается. */
const REQUIRED = [
  {
    name: 'DATABASE_URL',
    ok: () => Boolean(process.env.DATABASE_URL),
    why: 'база кабинета',
  },
  {
    name: 'SESSION_SECRET',
    ok: () => (process.env.SESSION_SECRET ?? '').length >= 32,
    why: 'свёртки токенов входа и сессий',
  },
  {
    name: 'CABINET_STORAGE_DIR',
    ok: () => Boolean(process.env.CABINET_STORAGE_DIR),
    why: 'хранилище материалов',
  },
] as const;

export interface CabinetReadiness {
  readonly ready: boolean;
  /** Имена незаданных настроек — для журнала и стенда разработки. */
  readonly missing: readonly string[];
}

export function cabinetReadiness(): CabinetReadiness {
  const missing = REQUIRED.filter((item) => !item.ok()).map((item) => item.name);
  return { ready: missing.length === 0, missing };
}

/** Пояснение к настройке — для подсказки на стенде разработки. */
export function settingPurpose(name: string): string | null {
  return REQUIRED.find((item) => item.name === name)?.why ?? null;
}
