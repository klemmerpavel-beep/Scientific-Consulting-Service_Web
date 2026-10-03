/**
 * Заготовки сообщений в переписке (требование Т-20, решение Р-316).
 *
 * Заготовка — ссылка на тот же экран переписки с параметром `?draft=`:
 * страница подставляет текст в поле, отправляет только кнопка
 * «Отправить». Кода в браузере нет (Р-178). Модуль чистый: проверяется
 * встроенным `node --test` без базы.
 */

import type { Role } from './access.ts';

export type DraftKey = 'call' | 'due';

export interface DraftLink {
  readonly key: DraftKey;
  readonly label: string;
}

/** Заготовки клиента (Т-20): созвон и перенос срока этапа. */
const CLIENT_DRAFTS: readonly DraftLink[] = [
  { key: 'call', label: 'Попросить созвон' },
  { key: 'due', label: 'Попросить перенести срок этапа' },
];

/** Заготовки, доступные роли в переписке. */
export function draftsFor(role: Role): readonly DraftLink[] {
  return role === 'CLIENT' ? CLIENT_DRAFTS : [];
}

/**
 * Текст заготовки. `stage` — текущий этап работы (первый не завершённый),
 * `today` — день по часам кабинета. Чужая роли заготовка — `null`: параметр
 * в адресе не открывает чужих текстов.
 */
export function draftText(
  role: Role,
  key: string | null | undefined,
  context: { readonly stage: string | null; readonly today: string },
): string | null {
  if (key === null || key === undefined) return null;
  if (!draftsFor(role).some((draft) => draft.key === key)) return null;
  const stage = context.stage === null ? 'этапа' : `этапа «${context.stage}»`;
  switch (key as DraftKey) {
    case 'call':
      return 'Прошу созвониться по работе. Удобное время: ';
    case 'due':
      return `Прошу перенести срок ${stage} на . Причина: `;
  }
  return null;
}
