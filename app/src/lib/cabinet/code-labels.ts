/**
 * Подписи кодов, которые стояли в модулях с базой (решение Р-766).
 *
 * Экраны брали их из `admin.ts`, `assignments.ts`, `channels.ts`,
 * `owner-templates.ts`, `recommendations.ts` и `head-checks.ts`, а журнал
 * действий взять их оттуда не мог: эти модули тянут `db.ts`, а он бросает
 * исключение при загрузке без `DATABASE_URL` — словарь журнала проверяется
 * встроенным `node --test` без базы. Журнал печатал коды: «было ACTIVE ·
 * стало SUSPENDED», «kind TELEGRAM» (Р-179, Р-758). Второе написание
 * перечня разошлось бы с первым при первой же правке, поэтому подписи
 * перенесены сюда, а прежние модули их реэкспортируют: источник один,
 * вызывающие не менялись.
 *
 * Модуль чистый: типы из базы — только `import type`.
 */

import type { AssignmentStatus, HeadCheckKind, RecommendationMarkStatus } from '../../generated/prisma/client.js';
import type { AccountStatus } from './access.ts';
import type { ContactKind } from './channels.ts';
import type { TemplateAudience } from './owner-templates.ts';

/** Состояние учётной записи (`admin.ts`, экран «Учётные записи»). */
export const ACCOUNT_STATUS_LABEL: Record<AccountStatus, string> = {
  ACTIVE: 'действует',
  SUSPENDED: 'приостановлена',
  ERASED: 'обезличена',
};

/** Состояние поручения руководителя (`assignments.ts`, требование РК-19). */
export const ASSIGNMENT_STATUS_LABEL: Record<AssignmentStatus, string> = {
  ASSIGNED: 'поставлено',
  IN_PROGRESS: 'в работе',
  DONE: 'сделано',
  WITHDRAWN: 'отозвано',
};

/** Способ связи (`channels.ts`, решение Р-198). */
export const CONTACT_LABEL: Record<ContactKind, string> = {
  EMAIL: 'Письмо на почту',
  TELEGRAM: 'Сообщение в Telegram',
  PHONE_CALL: 'Звонок менеджера',
  MESSENGER: 'Мессенджер или социальная сеть',
  FULL_SUPPORT: 'Полное сопровождение',
};

/** Адресат шаблона документа практики (`owner-templates.ts`, решение Р-562). */
export const AUDIENCE_LABEL: Readonly<Record<TemplateAudience, string>> = {
  STAFF: 'команде',
  ALL: 'всем, включая клиентов',
};

/** Отметка рекомендации (`recommendations.ts`, решения Р-349, Р-491). */
export const MARK_LABEL: Record<RecommendationMarkStatus, string> = {
  ACCEPTED: 'принято',
  DECLINED: 'отклонено',
  DONE: 'сделано',
  POSTPONED: 'отложено',
};

/** Дело руководителя «акт и счёт» (`head-checks.ts`, решение Р-338). */
export const CHECK_TITLE: Record<HeadCheckKind, string> = {
  ACT_AFTER_ACCEPT: 'Этап принят: приложить акт и выставить счёт за следующий этап',
  ACT_AFTER_REOPEN: 'Этап возвращён в работу: проверьте акт и транш',
  CONTRACT_BY_MANAGER: 'Проверьте договор',
};

/**
 * Как этап согласован (`head-checks.ts`: письмо руководителю о приёмке
 * этапа, решения Р-290, Р-292).
 */
export const APPROVAL_VIA_LABEL: Readonly<Record<string, string>> = {
  CLIENT_APPROVE: 'клиент согласовал этап',
  STAFF_FOR_CLIENT: 'менеджер согласовал этап за клиента',
  AUTO_ACCEPT: 'этап принят по истечении срока согласования',
};
