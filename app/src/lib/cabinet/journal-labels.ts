/**
 * Человеческие названия для журнала действий.
 *
 * В журнале стояли машинные коды: действие «IMPORT_PREVIEWED», объект
 * «ImportBatch», роль «HEAD», а подробности — сырым JSON. Читает журнал
 * руководитель практики, а не тот, кто писал код, и разбор спора начинался
 * с угадывания (решение Р-179).
 *
 * Код остаётся в выгрузке CSV: там он машинный по назначению — по нему
 * ищут и сверяют. На экране стоит название.
 */

const ACTIONS: Record<string, string> = {
  ACCESS_LINK_ISSUED: 'Выдана ссылка входа',
  CONTACT_ADDED: 'Добавлен способ связи',
  CONTACT_REMOVED: 'Убран способ связи',
  CONTACT_PREFERRED: 'Выбран предпочтительный способ связи',
  NOTIFY_RULES_SAVED: 'Изменены правила уведомлений',
  NOTIFY_CHANNELS_SAVED: 'Изменены каналы уведомлений',
  TELEGRAM_BOUND: 'Привязан Telegram',
  TELEGRAM_UNBOUND: 'Отвязан Telegram',
  HELP_REQUESTED: 'Куратор обратился за помощью',
  CLIENT_MERGED: 'Карточки клиента сведены',
  DISK_SYNC: 'Зеркало на Диске обновлено',
  BOOK_PULL: 'Книга заказов перенесена с Диска',
  CONTRACT_SAVED: 'Договор сохранён',
  ERASURE_EXECUTED: 'Данные удалены по требованию',
  ERASURE_REQUESTED: 'Поступило требование об удалении',
  EXPERT_ASSIGNED: 'Назначен исполнитель',
  EXPERT_NDA_UPDATED: 'Отмечен договор поручения',
  FINANCE_YEAR_REMOVE: 'Годовой итог снят',
  FINANCE_YEAR_SAVE: 'Годовой итог сохранён',
  IMPORT_APPLIED: 'Книга заказов перенесена',
  IMPORT_PREVIEWED: 'Книга заказов разобрана',
  JOURNAL_EXPORTED: 'Журнал выгружен',
  LEAD_APPROVED: 'Заявка одобрена',
  LEAD_DECLINED: 'Заявка отклонена',
  LEAD_EXPORT: 'Заявки выгружены',
  LEAD_FILE_DOWNLOADED: 'Скачано вложение заявки',
  LEAD_FILES_MOVED: 'Вложения заявки перенесены в работу',
  MANAGER_ASSIGNED: 'Назначен куратор',
  OUTBOX_RETRY: 'Уведомление отправлено заново',
  PAYOUT_ACCRUED: 'Начислено вознаграждение',
  PAYOUT_PAID: 'Вознаграждение выплачено',
  SERVICE_TYPE_ALIAS_ADDED: 'Привязано историческое написание',
  SERVICE_TYPE_ALIAS_REMOVED: 'Снято историческое написание',
  SERVICE_TYPE_SAVED: 'Позиция справочника сохранена',
  STAGE_TEMPLATE_REMOVED: 'Этап шаблона снят',
  STAGE_TEMPLATE_SAVED: 'Этап шаблона сохранён',
  TRANCHE_STATUS_CHANGED: 'Изменено состояние транша',
  USER_CREATED: 'Заведена учётная запись',
  USER_ROLE_CHANGED: 'Изменена роль',
  USER_STATUS_CHANGED: 'Изменено состояние доступа',
  VERSION_UPLOADED: 'Загружена версия материала',
  COMMENT_CREATED: 'Оставлен комментарий',
  COMMENT_PUBLISHED: 'Комментарий опубликован',
  COMMENT_REJECTED: 'Комментарий отклонён',
  STAGE_STATE_CHANGED: 'Изменено состояние этапа',
  STAGE_APPROVED: 'Этап согласован',
  STAGE_CREATED: 'Заведён этап',
  STAGE_EDITED: 'Этап изменён',
  PROJECT_EDITED: 'Карточка работы изменена',
  PROJECT_STATUS_CHANGED: 'Состояние работы изменено',
  MATERIAL_UPLOADED: 'Приложен материал',
  MESSAGE_SENT: 'Отправлено сообщение',
};

const OBJECTS: Record<string, string> = {
  ClientProfile: 'карточка клиента',
  Contract: 'договор',
  ErasureRequest: 'требование об удалении',
  ExpertPayout: 'вознаграждение',
  ExpertProfile: 'карточка эксперта',
  ImportBatch: 'загрузка книги',
  Lead: 'заявка',
  Material: 'материал',
  MaterialVersion: 'версия материала',
  Message: 'сообщение',
  NotificationOutbox: 'уведомление',
  Project: 'работа',
  ServiceType: 'позиция справочника',
  ServiceTypeAlias: 'историческое написание',
  Stage: 'этап',
  StageTemplate: 'шаблон этапов',
  Tranche: 'транш',
  User: 'учётная запись',
  VersionComment: 'комментарий к версии',
  YearlyFinance: 'годовой итог',
};

const ROLES: Record<string, string> = {
  CLIENT: 'клиент',
  EXPERT: 'эксперт',
  MANAGER: 'менеджер',
  HEAD: 'руководитель',
};

/** Название действия; незнакомый код показывается как есть — он точнее догадки. */
export function actionLabel(code: string): string {
  return ACTIONS[code] ?? code;
}

/**
 * Виды действий для отбора журнала, по алфавиту названий.
 *
 * Прежде перечень собирался обходом всего журнала (`distinct` без
 * ограничения числа строк): на сотне тысяч записей это чтение таблицы
 * целиком ради двух десятков значений, и растёт оно вместе с журналом.
 * Словарь знает те же коды — их пишет сервисный слой, и правило проверки
 * следит, чтобы ни один не завёлся мимо словаря (решение Р-186).
 */
export function actionCodes(): string[] {
  return Object.keys(ACTIONS).sort((a, b) => ACTIONS[a]!.localeCompare(ACTIONS[b]!, 'ru'));
}

export function objectLabel(code: string | null): string {
  if (code === null) return '—';
  return OBJECTS[code] ?? code;
}

export function roleLabel(code: string): string {
  return ROLES[code] ?? code;
}

/**
 * Подробности события словами.
 *
 * В поле лежит объект «было — стало»: состав зависит от действия, и общего
 * описания у него нет. Печатать его как есть — значит показывать человеку
 * `{"rows":6,"counts":{"SKIP":0}}`. Разбор идёт по одному правилу: пара
 * «имя поля — значение», имя переводится по словарю, вложенный объект
 * разворачивается в те же пары. Неизвестное имя остаётся собой: оно
 * честнее выдуманного перевода.
 */
const FIELDS: Record<string, string> = {
  rows: 'строк',
  counts: 'решения',
  fileName: 'файл',
  CREATE: 'к заведению',
  UPDATE: 'к обновлению',
  SKIP: 'уже перенесено',
  from: 'было',
  to: 'стало',
  reason: 'причина',
  code: 'код',
  title: 'название',
  amount: 'сумма',
  status: 'состояние',
  role: 'роль',
  email: 'почта',
  fullName: 'кто',
  expertId: 'исполнитель',
  managerId: 'куратор',
  projectId: 'работа',
  scope: 'объём',
  channel: 'канал',
  alias: 'написание',
  position: 'номер',
  held: 'на модерации',
  contactHint: 'есть контакты',
  telegram: 'Telegram',
  durationDays: 'длительность, дней',
  dueFrom: 'срок был',
  dueTo: 'срок стал',
  year: 'год',
};

export function detailsLabel(payload: unknown): string {
  const parts = flatten(payload);
  return parts.length === 0 ? '—' : parts.join(' · ');
}

function flatten(value: unknown, prefix = ''): string[] {
  if (value === null || value === undefined) return [];
  if (typeof value === 'boolean') return [`${prefix}${value ? 'да' : 'нет'}`];
  if (typeof value !== 'object') return [`${prefix}${String(value)}`];
  if (Array.isArray(value)) {
    return value.length === 0 ? [] : [`${prefix}${value.map((item) => String(item)).join(', ')}`];
  }

  const out: string[] = [];
  for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
    const name = FIELDS[key] ?? key;
    if (inner !== null && typeof inner === 'object' && !Array.isArray(inner)) {
      out.push(...flatten(inner, `${name}: `));
    } else if (inner !== null && inner !== undefined && String(inner).length > 0) {
      out.push(`${name} ${String(inner)}`);
    }
  }
  return out;
}
