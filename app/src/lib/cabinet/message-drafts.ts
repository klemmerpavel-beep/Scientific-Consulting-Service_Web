/**
 * Заготовки сообщений в переписке (требования Т-20 и М-21, решения Р-316 и
 * Р-317).
 *
 * Заготовка — ссылка на тот же экран переписки с параметром `?draft=`:
 * страница подставляет текст в поле, отправляет только кнопка
 * «Отправить». Кода в браузере нет (Р-178). Модуль чистый: проверяется
 * встроенным `node --test` без базы.
 */

import type { Role } from './access.ts';

export type DraftKey = 'call' | 'due' | 'remind' | 'callnote' | 'reschedule' | 'payment';

export interface DraftLink {
  readonly key: DraftKey;
  readonly label: string;
}

/** Заготовки клиента (Т-20): созвон и перенос срока этапа. */
const CLIENT_DRAFTS: readonly DraftLink[] = [
  { key: 'call', label: 'Попросить созвон' },
  { key: 'due', label: 'Попросить перенести срок этапа' },
];

/**
 * Заготовки куратора (М-21): напоминание о материалах, итог созвона, перенос
 * срока. Перенос здесь — предложение клиенту; сам срок меняется на экране
 * этапа с причиной (М-15). Итог созвона закрепляет договорённость письменно
 * там, где её видят обе стороны.
 */
const STAFF_DRAFTS: readonly DraftLink[] = [
  { key: 'remind', label: 'Напоминание о материалах' },
  { key: 'callnote', label: 'Итог созвона' },
  { key: 'reschedule', label: 'Перенос срока' },
  // Напоминание о просроченном платеже — из «Должников» (РК-10, Р-345).
  { key: 'payment', label: 'Напоминание об оплате' },
];

/** Заготовки, доступные роли в переписке. */
export function draftsFor(role: Role): readonly DraftLink[] {
  if (role === 'CLIENT') return CLIENT_DRAFTS;
  if (role === 'MANAGER' || role === 'HEAD') return STAFF_DRAFTS;
  return [];
}

/**
 * Текст заготовки. `stage` — текущий этап работы (первый не завершённый),
 * `today` — день по часам кабинета. Чужая роли заготовка — `null`: параметр
 * в адресе не открывает чужих текстов.
 */
export function draftText(
  role: Role,
  key: string | null | undefined,
  context: {
    readonly stage: string | null;
    readonly today: string;
    /** Транш для напоминания об оплате: назначение и плановая дата словами. */
    readonly payment?: { readonly title: string; readonly date: string | null } | null;
  },
): string | null {
  if (key === null || key === undefined) return null;
  if (!draftsFor(role).some((draft) => draft.key === key)) return null;
  const stage = context.stage === null ? 'этапа' : `этапа «${context.stage}»`;
  switch (key as DraftKey) {
    case 'call':
      return 'Прошу созвониться по работе. Удобное время: ';
    case 'due':
      return `Прошу перенести срок ${stage} на . Причина: `;
    case 'remind':
      return `Напоминаем: для ${stage} ждём от вас материалы. Приложить их можно на экране этапа или в «Материалах работы». `;
    case 'callnote':
      return `Итог созвона ${context.today}: договорились — `;
    case 'reschedule':
      return `Предлагаем перенести срок ${stage} на . Причина: `;
    case 'payment': {
      // Без сумм и расчётов практики: назначение платежа и дата срока.
      const payment = context.payment ?? null;
      if (payment === null) {
        return 'Напоминаем: срок очередной оплаты по договору прошёл. Счёт и реквизиты — в «Оплатах и документах» работы. ';
      }
      const when = payment.date === null ? '' : ` ${payment.date}`;
      return `Напоминаем: срок оплаты «${payment.title}» прошёл${when}. Счёт и реквизиты — в «Оплатах и документах» работы. `;
    }
  }
  return null;
}
