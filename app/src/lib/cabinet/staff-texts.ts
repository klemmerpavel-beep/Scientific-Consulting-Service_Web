/**
 * Тексты экрана настроек и вопроса руководителю — по роли смотрящего
 * (требование М-20, решение Р-306).
 *
 * Экран настроек писался для клиента: менеджер читал «Куратор видит этот
 * список…» и «…письмом куратору», хотя куратор — он сам, а его список
 * способов связи нужен руководителю, когда менеджер задаёт вопрос. Модуль
 * чистый: проверяется встроенным `node --test` без базы.
 */

import type { Role } from './access.ts';
import type { ContactKind } from './channels.ts';

/** Тексты экрана настроек, обращённые к смотрящему. */
export interface SettingsTexts {
  /** Под заголовком экрана: о чём приходят уведомления. */
  readonly lead: string;
  /** Под «Как с вами связываться»: кто видит список. */
  readonly contactsLead: string;
  /** Способа связи нет. */
  readonly contactsEmpty: string;
  /** Под «Куда слать уведомления». */
  readonly deliveryLead: string;
  /**
   * Окончание строки о согласии: кому писать об отзыве; экран дописывает
   * адрес практики ссылкой (требование Т-08, решение Р-314).
   */
  readonly consentTail: string;
}

const FOR_CLIENT: SettingsTexts = {
  lead: 'Уведомления приходят о том, что требует действия: этап ждёт материалов, материал готов к согласованию, приближается срок. Содержание переписки наружу не пересылается.',
  contactsLead: 'Менеджер видит этот список и держится его. Отметьте предпочтительный способ — с него и начнут.',
  contactsEmpty: 'Способ связи не указан — менеджер будет писать на почту учётной записи.',
  deliveryLead: 'Это то, что система шлёт сама. Звонки и сообщения в сетях делает менеджер — их здесь нет.',
  consentTail: 'Отозвать его и потребовать удаления данных можно письмом менеджеру или на',
};

const FOR_MANAGER: SettingsTexts = {
  lead: 'Уведомления приходят о том, что требует вашего решения: этап принят или возвращён, клиент написал, подходит срок. Содержание переписки наружу не пересылается.',
  contactsLead: 'Руководитель видит этот список, когда вы задаёте вопрос. Отметьте предпочтительный способ — с него и начнут.',
  contactsEmpty: 'Способ связи не указан — руководитель ответит на почту учётной записи.',
  deliveryLead: 'Это то, что система шлёт сама: письмо и Telegram. Звонков и сообщений в сетях здесь нет.',
  consentTail: 'Отозвать его и потребовать удаления данных можно письмом руководителю практики или на',
};

/**
 * Тексты экрана настроек для роли. Менеджеру — свои; руководителю и
 * эксперту пока прежние: требование М-20 касается экранов менеджера.
 */
export function settingsTexts(role: Role): SettingsTexts {
  return role === 'MANAGER' ? FOR_MANAGER : FOR_CLIENT;
}

/**
 * Подписи способов связи для менеджера: звонит и пишет ему руководитель, а
 * не куратор. «Полное сопровождение» — услуга клиенту, сотруднику её не
 * предлагают.
 */
const MANAGER_LABEL: Partial<Record<ContactKind, string>> = {
  PHONE_CALL: 'Звонок',
};

const MANAGER_NOTE: Partial<Record<ContactKind, string>> = {
  EMAIL: 'Ответ руководителя и уведомления приходят письмом.',
  TELEGRAM: 'Уведомления — сообщением в Telegram, быстрее письма.',
  PHONE_CALL: 'Руководитель звонит, когда вопрос быстрее решить голосом.',
  MESSENGER: 'Руководитель пишет туда, где вам удобно отвечать.',
  // Заведённое прежде остаётся видно, но названо прямо.
  FULL_SUPPORT: 'Услуга клиенту, сотруднику она не нужна — этот способ можно убрать.',
};

/** Способы связи, которые роль может себе завести. */
export function contactKindsFor(role: Role, kinds: readonly ContactKind[]): ContactKind[] {
  return role === 'MANAGER' ? kinds.filter((kind) => kind !== 'FULL_SUPPORT') : [...kinds];
}

/** Подпись способа связи для роли; `base` — общая подпись. */
export function contactLabelFor(role: Role, kind: ContactKind, base: Record<ContactKind, string>): string {
  return (role === 'MANAGER' ? MANAGER_LABEL[kind] : undefined) ?? base[kind];
}

/** Пояснение под способом связи для роли; `base` — общее пояснение. */
export function contactNoteFor(role: Role, kind: ContactKind, base: Record<ContactKind, string>): string {
  return (role === 'MANAGER' ? MANAGER_NOTE[kind] : undefined) ?? base[kind];
}

/** Текст карточки вопроса руководителю: обещает только то, что есть. */
export const HELP_CARD_NOTE =
  'Спорный случай, нестандартная просьба клиента, сомнение по срокам или цене. Руководитель получит уведомление и ответит по почте или в Telegram.';

/**
 * Письмо руководителю с вопросом: сам вопрос и как ответить спросившему —
 * почта учётной записи и предпочтительный способ связи из настроек.
 * Прежде в письме был только текст, и отвечать приходилось наугад.
 */
export function helpLetterBody(
  question: string,
  from: {
    fullName: string;
    email: string;
    preferred: { label: string; value: string | null; note: string | null } | null;
  },
): string {
  const preferred =
    from.preferred === null
      ? 'не указан — почта учётной записи'
      : `${from.preferred.label}${from.preferred.value === null ? '' : ` — ${from.preferred.value}`}${
          from.preferred.note === null ? '' : ` (${from.preferred.note})`
        }`;
  return [
    question,
    '',
    `Спрашивает: ${from.fullName}, ${from.email}`,
    `Предпочтительный способ связи: ${preferred}`,
  ].join('\n');
}
