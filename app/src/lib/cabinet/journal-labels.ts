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

import { EXPERT_STATUS_LABEL } from '../expert-application.ts';
import { SEVERITY_LABEL, STATUS_LABEL as FEEDBACK_STATUS_LABEL } from '../feedback.ts';
import { expertRoleLabel } from './access.ts';
import type { CuratorProfileInput } from './admin.ts';
import { MONTHS_SHORT } from './analytics/metrics.ts';
import { formatDay } from './approval-text.ts';
import { WORK_BRIEF_LABEL } from './brief/work-rows.ts';
import {
  ACCOUNT_STATUS_LABEL,
  APPROVAL_VIA_LABEL,
  ASSIGNMENT_STATUS_LABEL,
  AUDIENCE_LABEL,
  CHECK_TITLE,
  CONTACT_LABEL,
  MARK_LABEL,
} from './code-labels.ts';
import { eventLabel } from './events.ts';
import { leadSourceLabel, leadStatusLabel } from './lead-labels.ts';
import type { LeadEditField } from './lead-work.ts';
import { formatAmount, STATUS_LABEL as TRANCHE_STATUS_LABEL } from './money.ts';
import { PROJECT_STATUS_LABEL } from './project-status.ts';
import { SERVICE_CHECKLISTS } from './service-checklists.ts';
import { stageStateLabel } from './stage-state.ts';
import { SUMMARY_BANDS, SUMMARY_PLATES } from './summary-layout.ts';
import { COLUMN_SETS } from './table-views.ts';

const ACTIONS: Record<string, string> = {
  ACCESS_LINK_ISSUED: 'Выдана ссылка входа',
  CONTACT_ADDED: 'Добавлен способ связи',
  CONTACT_REMOVED: 'Убран способ связи',
  CONTACT_PREFERRED: 'Выбран предпочтительный способ связи',
  NOTIFY_RULES_SAVED: 'Изменены правила уведомлений',
  NOTIFY_CHANNELS_SAVED: 'Изменены каналы уведомлений',
  TELEGRAM_BOUND: 'Привязан Telegram',
  TELEGRAM_UNBOUND: 'Отвязан Telegram',
  HELP_REQUESTED: 'Менеджер обратился за помощью',
  CLIENT_MERGED: 'Карточки клиента сведены',
  CLIENT_EMAIL_ADDED: 'В карточку клиента вписана почта',
  DISK_SYNC: 'Зеркало на Диске обновлено',
  BOOK_PULL: 'Книга заказов перенесена с Диска',
  BRIEF_APPLIED: 'Карточка обновлена из документа',
  CHECKLIST_MARKED: 'Отмечены шаги чек-листа работы',
  CONTRACT_SAVED: 'Договор сохранён',
  ERASURE_EXECUTED: 'Данные удалены по требованию',
  ERASURE_REQUESTED: 'Поступило требование об удалении',
  EXPERT_ASSIGNED: 'Назначен куратор',
  EXPERT_NDA_UPDATED: 'Отмечен договор поручения',
  FEEDBACK_EXPORTED: 'Замечания выгружены',
  FINANCE_EXPORTED: 'Деньги по работам выгружены',
  PROJECTS_EXPORTED: 'Работы выгружены',
  FEEDBACK_REVIEWED: 'Замечание разобрано',
  EXPERT_APPLICATION_REVIEWED: 'Анкета кандидата разобрана',
  EXPERT_APPLICATION_DELETED: 'Анкета кандидата удалена',
  EXPERT_APPLICATIONS_EXPORTED: 'Анкеты кандидатов выгружены',
  EXPERT_FILE_DOWNLOADED: 'Скачан файл анкеты кандидата',
  FINANCE_YEAR_REMOVE: 'Годовой итог снят',
  FINANCE_YEAR_SAVE: 'Годовой итог сохранён',
  IMPORT_APPLIED: 'Книга заказов перенесена',
  IMPORT_PREVIEWED: 'Книга заказов разобрана',
  JOURNAL_EXPORTED: 'Журнал выгружен',
  LEAD_APPROVED: 'Заявка одобрена',
  ORDER_CREATED: 'Заведён заказ вручную',
  LEAD_DECLINED: 'Заявка отклонена',
  LEAD_STATUS_CHANGED: 'Изменено состояние заявки',
  LEAD_EDITED: 'Сведения заявки исправлены',
  LEAD_COMMENTED: 'Комментарий к заявке',
  REQUEST_VIA_STAFF_LINK: 'Заявка подана во входе по ссылке сотрудника',
  LEAD_EXPORT: 'Заявки выгружены',
  LEAD_FILE_DOWNLOADED: 'Скачано вложение заявки',
  LEAD_FILES_MOVED: 'Вложения заявки перенесены в работу',
  MANAGER_ASSIGNED: 'Назначен менеджер',
  OUTBOX_RETRY: 'Уведомление отправлено заново',
  PAYOUT_ACCRUED: 'Начислено вознаграждение',
  PAYOUT_PAID: 'Вознаграждение выплачено',
  SERVICE_TYPE_ALIAS_ADDED: 'Привязано историческое написание',
  SERVICE_TYPE_ALIAS_REMOVED: 'Снято историческое написание',
  SERVICE_TYPE_SAVED: 'Позиция справочника сохранена',
  CALENDAR_DAY_SAVED: 'День производственного календаря сохранён',
  STAFF_REGALIA_SAVED: 'Регалии сотрудника сохранены',
  CURATOR_PROFILE_SAVED: 'Профиль куратора изменён',
  NDA_REQUESTED: 'Куратор сообщил руководителю, что ждёт договор поручения',
  PRACTICE_SETTING_SAVED: 'Изменена настройка практики',
  SUMMARY_LAYOUT_SAVED: 'Изменена раскладка «Сводки»',
  HEAD_CHECK_CLOSED: 'Закрыто дело руководителя',
  CALENDAR_DAY_REMOVED: 'День производственного календаря снят',
  STAGE_TEMPLATE_REMOVED: 'Этап шаблона снят',
  STAGE_TEMPLATE_SAVED: 'Этап шаблона сохранён',
  TEMPLATE_UPLOADED: 'Загружен шаблон документа',
  TEMPLATE_REPLACED: 'Заменён шаблон документа',
  TEMPLATE_REMOVED: 'Убран шаблон документа',
  WORK_RATED: 'Клиент оценил сопровождение',
  TRANCHE_STATUS_CHANGED: 'Изменено состояние транша',
  TRANCHE_ADDED: 'Заведён транш',
  TRANCHE_REMOVED: 'Удалён плановый транш',
  TRANCHE_RESCHEDULED: 'Перенесена плановая дата транша',
  RECOMMENDATION_MARKED: 'Отмечена рекомендация',
  ASSIGNMENT_CREATED: 'Поставлено поручение',
  ASSIGNMENT_STATUS: 'Изменено состояние поручения',
  EXPENSE_ADDED: 'Внесён расход',
  EXPENSE_REMOVED: 'Удалён расход',
  USER_CREATED: 'Заведена учётная запись',
  USER_ROLE_CHANGED: 'Изменена роль',
  USER_STATUS_CHANGED: 'Изменено состояние доступа',
  VERSION_UPLOADED: 'Загружена версия материала',
  VERSION_PUBLISHED: 'Версия куратора опубликована клиенту',
  VERSION_REJECTED: 'Версия куратора не опубликована',
  COMMENT_CREATED: 'Оставлен комментарий',
  COMMENT_PUBLISHED: 'Комментарий опубликован',
  COMMENT_REJECTED: 'Комментарий отклонён',
  STAGE_STATE_CHANGED: 'Изменено состояние этапа',
  STAGE_APPROVED: 'Этап согласован',
  STAGE_RETURNED: 'Этап возвращён клиентом с замечаниями',
  STAGE_RETURN_ACKNOWLEDGED: 'Замечания клиента приняты в работу',
  STAGE_HANDED_OVER: 'Куратор сдал этап менеджеру',
  STAGE_HANDOVER_RECALLED: 'Куратор отозвал сдачу этапа',
  STAGE_HANDED_BACK: 'Этап возвращён куратору',
  STAGE_CREATED: 'Заведён этап',
  PLAN_CHANGED: 'Изменён план работ',
  STAGE_REOPENED: 'Этап возвращён в работу',
  STAGE_EDITED: 'Этап изменён',
  PROJECT_EDITED: 'Карточка работы изменена',
  PROJECT_STATUS_CHANGED: 'Состояние работы изменено',
  MATERIAL_UPLOADED: 'Приложен материал',
  MESSAGE_SENT: 'Отправлено сообщение',
};

/**
 * Виды объектов. Каждый вид, который пишет сервисный слой, назван здесь:
 * правило проверки следит, чтобы новый не завёлся мимо словаря, — иначе
 * руководитель читал бы «HeadCheck» и «PracticeSetting» (решение Р-766).
 */
const OBJECTS: Record<string, string> = {
  Assignment: 'поручение',
  AuditEvent: 'журнал действий',
  CalendarDay: 'день календаря',
  ClientProfile: 'карточка клиента',
  ContactChannel: 'способ связи',
  Contract: 'договор',
  DocumentTemplate: 'шаблон документа',
  ErasureRequest: 'требование об удалении',
  Expense: 'расход',
  ExpertApplication: 'анкета кандидата',
  ExpertPayout: 'вознаграждение',
  ExpertProfile: 'карточка куратора',
  Feedback: 'замечание с виджета',
  FileAccessLog: 'журнал доступа к файлам',
  HeadCheck: 'дело руководителя',
  ImportBatch: 'загрузка книги',
  Lead: 'заявка',
  LeadAttachment: 'вложение заявки',
  Material: 'материал',
  MaterialVersion: 'версия материала',
  Message: 'сообщение',
  Mirror: 'зеркало на Диске',
  NotificationOutbox: 'уведомление',
  NotifyRule: 'правила уведомлений',
  PracticeSetting: 'настройка практики',
  Project: 'работа',
  RecommendationMark: 'отметка рекомендации',
  ServiceType: 'позиция справочника',
  ServiceTypeAlias: 'историческое написание',
  Stage: 'этап',
  StageTemplate: 'шаблон этапов',
  Tranche: 'транш',
  User: 'учётная запись',
  VersionComment: 'комментарий к версии',
  WorkRating: 'оценка работы',
  YearlyFinance: 'годовой итог',
};

const ROLES: Record<string, string> = {
  CLIENT: 'клиент',
  EXPERT: 'куратор',
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
 * Действия журнала доступа к файлам. Стояли на экране журнала; отсюда их
 * берёт и экран, и подробности выгрузки журнала, где отбор по действию
 * записан кодом (решение Р-766).
 */
export const FILE_ACTION_LABEL: Record<string, string> = {
  UPLOAD: 'загрузка',
  PRESIGN: 'выдача ссылки',
  DOWNLOAD: 'скачивание',
  PURGE: 'изъятие',
};

/** Момент по московскому времени — так он стоит в столбце «Когда». */
export function formatMoment(value: Date): string {
  return value.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
}

/**
 * Идентификатор записи базы (`cuid`: «c» и строчная латиница с цифрами).
 * На экране журнала он не печатается — человеку он ничего не говорит, а
 * сверяют по нему в выгрузке CSV, где он остаётся, как машинный код
 * действия (Р-179; решение Р-758).
 */
export function isRecordId(value: unknown): value is string {
  return typeof value === 'string' && /^c[a-z0-9]{20,}$/u.test(value);
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
 *
 * Каждый ключ, который сервисный слой пишет в данные события, назван здесь
 * или правилом действия ниже: правило проверки следит, чтобы новый не
 * завёлся мимо словаря (решение Р-766). Названы и поля, где лежит
 * идентификатор: сам он на экран не выводится (Р-758), а имя печатается,
 * если значение — не идентификатор.
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
  total: 'сумма договора',
  totalFrom: 'сумма была',
  numberFrom: 'номер был',
  paidOn: 'дата оплаты',
  plannedDate: 'срок',
  status: 'состояние',
  role: 'роль',
  email: 'почта',
  fullName: 'кто',
  expertId: 'куратор',
  managerId: 'менеджер',
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
  consentGiven: 'согласие и акцепт отмечены в ней',
  staffLink: 'вход по ссылке сотрудника',
  // Ниже — поля, которые печатались ключом (решение Р-766). Слова — с
  // экранов, где поле правится или показывается.
  name: 'название',
  number: 'номер',
  note: 'заметка',
  file: 'файл',
  files: 'файлов',
  material: 'материал',
  version: 'версия',
  moderated: 'ждёт публикации',
  comments: 'опубликовано пояснений куратора',
  withNote: 'с причиной',
  clientId: 'клиент',
  userId: 'учётная запись',
  leadId: 'заявка',
  assigneeId: 'кому поручено',
  stageId: 'этап',
  commentId: 'комментарий',
  serviceTypeId: 'вид работ',
  actorId: 'действующее лицо',
  into: 'сведена в карточку',
  dueOn: 'срок',
  signedOn: 'подписан',
  expiresAt: 'действует до',
  degree: 'учёная степень',
  specialization: 'научная специальность',
  defaultPayout: 'ставка по умолчанию',
  dailyDigest: 'письма о работах — одной сводкой',
  heads: 'уведомлено руководителей',
  rules: 'включено правил',
  variant: 'вариант темы',
  attached: 'документ приложен к материалам',
  byClient: 'подано клиентом в кабинете',
  projects: 'работ',
  objectsPurged: 'объектов изъято',
  objectsFailed: 'объектов не изъято',
  contractTotal: 'сумма договоров',
  truncated: 'выгрузка обрезана',
  revenue: 'выручка',
  costs: 'расходы',
  created: 'заведено',
  updated: 'обновлено',
  skipped: 'пропущено',
  rejected: 'отклонено',
  letter: 'письмо заявителю',
  approvalDaysFrom: 'срок согласования был, рабочих дней',
  approvalDaysTo: 'срок согласования стал, рабочих дней',
  score: 'оценка',
  withText: 'с отзывом',
  publishAllowed: 'публикация отзыва на сайте разрешена',
};

/** Правило поля у одного действия: своё имя и, если нужно, подпись значения. */
interface FieldRule {
  /** Имя поля; пустое — значение говорит само за себя («клиент согласовал этап»). */
  readonly name: string;
  /**
   * Подпись значения; пустая строка — поле называется одним именем.
   * Второй аргумент — данные события, где стоит поле: шаг чек-листа
   * называется по своему чек-листу, ключи шагов у чек-листов совпадают.
   */
  readonly value?: (raw: string, data: Readonly<Record<string, unknown>>) => string;
  /**
   * Правила полей вложенного объекта. У разбора замечания `status` и
   * `severity` — оба `{from, to}`, и листья подписываются каждый своим
   * перечнем, а имя поля стоит перед ними: «состояние: было новое, стало
   * исправлено» (решение Р-766).
   */
  readonly fields?: Readonly<Record<string, FieldRule>>;
  /**
   * Поле на экран не выводится: его значение уже стоит в строке журнала
   * словами (код работы — названием работы, Р-189) и остаётся в выгрузке
   * CSV (решение Р-758).
   */
  readonly hidden?: true;
}

/** Код работы в подробностях: работа названа в строке журнала (Р-189). */
const WORK_CODE: FieldRule = { name: 'код', hidden: true };

/** Роль — словом, как роль действующего лица (решение Р-758). */
const roleValue = (raw: string): string => roleLabel(raw);

const byMap =
  (map: Readonly<Record<string, string>>) =>
  (raw: string): string =>
    map[raw] ?? raw;

const quoted = (text: string): string => `«${text}»`;

/**
 * «Было — стало» со своей подписью значения. Одно и то же состояние у
 * разных действий значит разное — `DONE` этапа «Завершён», поручения
 * «сделано», рекомендации «сделано», — поэтому подпись берётся по
 * действию, а не одним словарём кодов (решение Р-766).
 */
const change = (value: (raw: string) => string) =>
  ({ from: { name: 'было', value }, to: { name: 'стало', value } }) satisfies Record<string, FieldRule>;

/** День, как на экранах: «30 сентября 2026». Не дата — как есть. */
function dayLabel(raw: string): string {
  if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z)?$/u.test(raw)) return raw;
  const day = new Date(raw);
  return Number.isNaN(day.getTime()) ? raw : formatDay(day);
}

/** Момент — по Москве, как в столбце «Когда». Не момент — как есть. */
function momentLabel(raw: string): string {
  const at = /^\d{4}-\d{2}-\d{2}T/u.test(raw) ? new Date(raw) : null;
  return at === null || Number.isNaN(at.getTime()) ? raw : formatMoment(at);
}

/** Месяц `ГГГГ-ММ` — как в перечне расходов «Прибыли по месяцам»: «окт 2026». */
function monthLabel(raw: string): string {
  const match = /^(\d{4})-(\d{2})$/u.exec(raw);
  const name = match === null ? undefined : MONTHS_SHORT[Number(match[2]) - 1];
  return match === null || name === undefined ? raw : `${name} ${match[1]}`;
}

/** Объём требования — словами экрана «Удаление по требованию субъекта». */
const ERASURE_SCOPE_LABEL: Readonly<Record<string, string>> = {
  PERSONAL_DATA_AND_FILES: 'данные и файлы',
  PERSONAL_DATA: 'только данные',
};

/** Что уходит в зеркало — словами экрана «Зеркало на облачном диске». */
const DISK_SCOPE_LABEL: Readonly<Record<string, string>> = {
  all: 'таблицы и материалы работ',
  tables: 'только таблицы реестров',
  anon: 'таблицы без персональных данных',
};

/**
 * Ветка переписки — как она названа на экранах: внутренняя — как в сигнале
 * о новом сообщении, ветка с руководителем — как на экране менеджера
 * «Руководитель».
 */
const THREAD_LABEL: Readonly<Record<string, string>> = {
  WORK_INTERNAL: eventLabel('INTERNAL_MESSAGE'),
  HEAD_STAFF: 'переписка с руководителем практики',
};

/** Поля регалий и профиля куратора — подписями формы «Учётные записи». */
const PROFILE_FIELD_LABEL = {
  position: 'Должность',
  degree: 'Учёная степень',
  academicTitle: 'Учёное звание',
  specialtyCode: 'Шифр специальности',
  specialization: 'Научная специальность',
  university: 'Вуз',
  defaultPayout: 'Ставка по умолчанию',
} satisfies Record<keyof CuratorProfileInput, string>;

/** Поля заявки — подписями формы правки на экране заявки. */
const LEAD_FIELD_LABEL = {
  name: 'Имя',
  contact: 'Контакт',
  phone: 'Дополнительный телефон',
  organization: 'Организация или вуз',
  topic: 'Тема',
  need: 'Что нужно',
  deadline: 'Желаемый срок',
  message: 'Текст обращения',
} satisfies Record<LeadEditField, string>;

/** Чек-лист вида работы по ключу (решения Р-554, Р-555). */
const checklistOf = (key: unknown) => SERVICE_CHECKLISTS.find((list) => list.key === key);

/** Шаг — текстом своего чек-листа: ключ шага у разных чек-листов один. */
const stepValue = (raw: string, data: Readonly<Record<string, unknown>>): string => {
  const text = checklistOf(data.checklist)?.steps.find((step) => step.key === raw)?.text;
  return text === undefined ? raw : quoted(text.replace(/\.$/u, ''));
};

const COLUMN_SET_LABEL = Object.fromEntries(COLUMN_SETS.map((set) => [set.key, set.label]));
const LAYOUT_LABEL = Object.fromEntries([...SUMMARY_PLATES, ...SUMMARY_BANDS].map((item) => [item.key, item.label]));
const filterRules = {
  query: { name: 'поиск' },
  manager: { name: 'отбор по менеджеру' },
  curator: { name: 'отбор по куратору' },
  due: { name: 'отбор по сроку' },
  columns: { name: 'набор', value: byMap(COLUMN_SET_LABEL) },
} satisfies Record<string, FieldRule>;

/** Переход этапа — подписями практики (Р-206); способ согласования — словами. */
const STAGE_CHANGE = {
  ...change(stageStateLabel),
  via: { name: '', value: byMap(APPROVAL_VIA_LABEL) },
} satisfies Record<string, FieldRule>;
const CONTACT_KIND = { kind: { name: 'способ', value: byMap(CONTACT_LABEL) } } satisfies Record<string, FieldRule>;
const TEMPLATE_AUDIENCE = { audience: { name: 'кому', value: byMap(AUDIENCE_LABEL) } } satisfies Record<string, FieldRule>;
const EXPENSE = { month: { name: 'месяц', value: monthLabel }, category: { name: 'статья' } } satisfies Record<
  string,
  FieldRule
>;
/** Разбор и выгрузка замечаний службой по ключу (решение Р-405). */
const BY_KEY = { name: '', value: byMap({ key: 'по ключу выгрузки' }) } satisfies FieldRule;

/**
 * Поля, которые у действия значат не то, что в общем словаре, или хранят
 * код вместо слова. У выгрузки заявок `total` — число заявок в отборе, а
 * не сумма договора; вкладка, набор столбцов и плашки «Сводки» записаны
 * кодами, и руководитель читал бы «state all» и «hidden pulse» (К-3, К-5).
 * Состояния «было — стало», виды и ключи полей — так же: подписи берутся
 * из тех перечней, которыми их называют экраны (решение Р-766).
 */
const ACTION_FIELDS: Readonly<Record<string, Readonly<Record<string, FieldRule>>>> = {
  LEAD_EXPORT: {
    ...filterRules,
    total: { name: 'всего в отборе' },
    source: { name: 'страница', value: leadSourceLabel },
    status: { name: 'состояние', value: leadStatusLabel },
  },
  PROJECTS_EXPORTED: {
    ...filterRules,
    state: {
      name: 'вкладка',
      value: byMap({ active: 'Действующие', waiting: 'Ждут клиента', done: 'Завершённые', all: 'Все' }),
    },
  },
  FINANCE_EXPORTED: {
    ...filterRules,
    set: { name: 'отбор', value: byMap({ owing: 'С остатком', all: 'Все работы с договором' }) },
  },
  SUMMARY_LAYOUT_SAVED: {
    order: { name: 'порядок', value: byMap(LAYOUT_LABEL) },
    hidden: { name: 'скрыто', value: byMap(LAYOUT_LABEL) },
    reset: { name: 'раскладка по умолчанию', value: () => '' },
  },
  // Роль учётной записи хранится кодом: руководитель читал «роль MANAGER»
  // (решение Р-758).
  USER_CREATED: {
    role: { name: 'роль', value: roleValue },
    profile: { name: 'заполнено', value: byMap(PROFILE_FIELD_LABEL) },
  },
  USER_ROLE_CHANGED: change(roleValue),
  // Код работы — в адресе ссылки на работу и в выгрузке, не на экране (Р-189).
  LEAD_APPROVED: { code: WORK_CODE },
  ORDER_CREATED: { code: WORK_CODE },
  ASSIGNMENT_CREATED: { project: WORK_CODE },
  // Ниже — коды значений, которые печатались как есть (решение Р-766).
  ACCESS_LINK_ISSUED: { via: { name: '', value: byMap({ project: 'вход открыт клиенту на карточке работы' }) } },
  OUTBOX_RETRY: { eventKind: { name: 'уведомление', value: (raw) => quoted(eventLabel(raw)) } },
  STAFF_REGALIA_SAVED: { position: { name: 'должность' }, code: { name: 'шифр специальности' } },
  CURATOR_PROFILE_SAVED: { changed: { name: 'изменено', value: byMap(PROFILE_FIELD_LABEL) } },
  USER_STATUS_CHANGED: change(byMap(ACCOUNT_STATUS_LABEL)),
  CALENDAR_DAY_SAVED: { workday: { name: 'вид дня', value: (raw) => (raw === 'true' ? 'рабочий' : 'нерабочий') } },
  STAGE_APPROVED: STAGE_CHANGE,
  STAGE_STATE_CHANGED: STAGE_CHANGE,
  STAGE_REOPENED: STAGE_CHANGE,
  STAGE_RETURNED: STAGE_CHANGE,
  ASSIGNMENT_STATUS: change(byMap(ASSIGNMENT_STATUS_LABEL)),
  BRIEF_APPLIED: { fields: { name: 'обновлено', value: byMap(WORK_BRIEF_LABEL) } },
  CONTACT_ADDED: CONTACT_KIND,
  CONTACT_REMOVED: CONTACT_KIND,
  CONTACT_PREFERRED: CONTACT_KIND,
  CHECKLIST_MARKED: {
    checklist: { name: 'чек-лист', value: (raw) => quoted(checklistOf(raw)?.title ?? raw) },
    added: { name: 'отмечено', value: stepValue },
    removed: { name: 'снято', value: stepValue },
  },
  ERASURE_REQUESTED: { scope: { name: 'объём', value: byMap(ERASURE_SCOPE_LABEL) } },
  EXPERT_APPLICATION_REVIEWED: {
    status: { name: 'состояние', fields: change(byMap(EXPERT_STATUS_LABEL)) },
    note: { name: 'есть пометка' },
  },
  FEEDBACK_REVIEWED: {
    status: { name: 'состояние', fields: change(byMap(FEEDBACK_STATUS_LABEL)) },
    severity: { name: 'критичность', fields: change(byMap(SEVERITY_LABEL)) },
    note: { name: 'есть «Что сделано»' },
    via: BY_KEY,
  },
  FEEDBACK_EXPORTED: { via: BY_KEY },
  TRANCHE_STATUS_CHANGED: change(byMap(TRANCHE_STATUS_LABEL)),
  TRANCHE_RESCHEDULED: change(dayLabel),
  HEAD_CHECK_CLOSED: {
    kind: { name: 'дело', value: (raw) => quoted(byMap(CHECK_TITLE)(raw)) },
    note: { name: 'отметка' },
  },
  CLIENT_MERGED: { projects: { name: 'работ перенесено' } },
  LEAD_STATUS_CHANGED: change(leadStatusLabel),
  LEAD_EDITED: { fields: { name: 'исправлено', value: byMap(LEAD_FIELD_LABEL) } },
  MESSAGE_SENT: { thread: { name: '', value: byMap(THREAD_LABEL) } },
  TEMPLATE_UPLOADED: TEMPLATE_AUDIENCE,
  TEMPLATE_REPLACED: TEMPLATE_AUDIENCE,
  // Дата начала учёта — днём; срок реакции и пороги — числами, как есть.
  PRACTICE_SETTING_SAVED: change(dayLabel),
  // Статья расхода — ключ справочника в базе: подписи статей живут в базе,
  // словарю без базы их взять неоткуда, ключ остаётся (решение Р-766).
  EXPENSE_ADDED: EXPENSE,
  EXPENSE_REMOVED: EXPENSE,
  LEAD_FILES_MOVED: { count: { name: 'перенесено' }, failed: { name: 'не перенесено' } },
  PROJECT_EDITED: {
    expertRoleFrom: { name: 'роль куратора была', value: expertRoleLabel },
    expertRoleTo: { name: 'роль куратора стала', value: expertRoleLabel },
  },
  PROJECT_STATUS_CHANGED: change(byMap(PROJECT_STATUS_LABEL)),
  PLAN_CHANGED: {
    moved: { name: 'место этапа', fields: { from: { name: 'было' }, to: { name: 'стало' } } },
    removed: { name: 'удалён этап' },
    template: { name: 'этапов по шаблону' },
  },
  RECOMMENDATION_MARKED: { status: { name: 'отметка', value: byMap(MARK_LABEL) } },
  // Отбор выгрузки — подписями полей отбора экрана журнала.
  JOURNAL_EXPORTED: {
    filter: {
      name: 'отбор',
      fields: {
        from: { name: 'с даты', value: dayLabel },
        to: { name: 'по дату', value: dayLabel },
        actorId: { name: 'по действующему лицу' },
        action: { name: 'действие', value: (raw) => quoted(ACTIONS[raw] ?? FILE_ACTION_LABEL[raw] ?? raw) },
        projectTitle: { name: 'по названию работы' },
      },
    },
  },
  // Прогоны по расписанию — словами экрана «Зеркало на облачном диске».
  BOOK_PULL: { held: { name: 'на разбор' }, erased: { name: 'стёрто по требованию субъекта' } },
  DISK_SYNC: {
    uploaded: { name: 'ушло' },
    removed: { name: 'удалено' },
    failed: { name: 'ошибок' },
    files: { name: 'в зеркале' },
    scope: { name: 'объём', value: byMap(DISK_SCOPE_LABEL) },
  },
};

/** Поля с суммой: журнал хранит их строкой копеек, bigint в JSON не кладётся. */
const MONEY_KEYS = new Set(['amount', 'total', 'totalFrom', 'contractTotal', 'revenue', 'costs', 'defaultPayout']);

/** Поля с днём: «ГГГГ-ММ-ДД» или полночь дня из поля даты формы. */
const DAY_KEYS = new Set(['dueOn', 'dueFrom', 'dueTo', 'paidOn', 'plannedDate', 'signedOn']);

/** Поля с моментом: срок ссылки входа — до минуты, по Москве. */
const MOMENT_KEYS = new Set(['expiresAt']);

/**
 * Значение поля для человека: рубли вместо копеек, «да»/«нет» вместо
 * true/false, день и момент словами вместо записи ISO.
 */
function valueLabel(key: string, value: unknown): string {
  if (typeof value === 'boolean') return value ? 'да' : 'нет';
  if (typeof value === 'string' && MONEY_KEYS.has(key) && /^-?\d+$/u.test(value)) {
    return formatAmount(BigInt(value));
  }
  if (typeof value === 'string' && DAY_KEYS.has(key)) return dayLabel(value);
  if (typeof value === 'string' && MOMENT_KEYS.has(key)) return momentLabel(value);
  return String(value);
}

/** Имя поля и подпись значения; пустое из двух не печатается. */
const named = (name: string, text: string): string => [name, text].filter((part) => part !== '').join(' ');

export function detailsLabel(payload: unknown, action?: string): string {
  const parts = flatten(payload, '', action === undefined ? undefined : ACTION_FIELDS[action]);
  return parts.length === 0 ? '—' : parts.join(' · ');
}

function flatten(value: unknown, prefix = '', rules?: Readonly<Record<string, FieldRule>>): string[] {
  if (value === null || value === undefined) return [];
  if (typeof value === 'boolean') return [`${prefix}${value ? 'да' : 'нет'}`];
  // Идентификатор записи на экран не выводится — он остаётся в выгрузке
  // CSV (решение Р-758).
  if (isRecordId(value)) return [];
  if (typeof value !== 'object') return [`${prefix}${String(value)}`];
  if (Array.isArray(value)) {
    const shown = value.filter((item) => !isRecordId(item));
    return shown.length === 0 ? [] : [`${prefix}${shown.map((item) => String(item)).join(', ')}`];
  }

  const data = value as Record<string, unknown>;
  const out: string[] = [];
  for (const [key, inner] of Object.entries(data)) {
    const rule = rules?.[key];
    if (rule?.hidden === true) continue;
    // Поле со значением-идентификатором: у поля со своим правилом остаётся
    // имя — «отбор по менеджеру» и без идентификатора говорит, что отбор
    // был; общее поле («было», «куратор») без значения ничего не говорит и
    // не печатается вовсе (решение Р-758).
    if (isRecordId(inner)) {
      if (rule !== undefined && rule.name !== '') out.push(rule.name);
      continue;
    }
    if (rule !== undefined && inner !== null && inner !== undefined && typeof inner !== 'object') {
      const text = named(rule.name, rule.value === undefined ? valueLabel('', inner) : rule.value(String(inner), data));
      if (text !== '') out.push(text);
      continue;
    }
    if (rule?.value !== undefined && Array.isArray(inner)) {
      if (inner.length > 0) out.push(`${rule.name}: ${inner.map((item) => rule.value!(String(item), data)).join(', ')}`);
      continue;
    }
    // Вложенный объект со своими правилами — одной частью с именем поля:
    // «критичность: было высокая, стало низкая» (решение Р-766).
    if (rule?.fields !== undefined && inner !== null && typeof inner === 'object' && !Array.isArray(inner)) {
      const parts = flatten(inner, '', rule.fields);
      if (parts.length > 0) out.push(`${rule.name}: ${parts.join(', ')}`);
      continue;
    }
    const name = rule?.name ?? FIELDS[key] ?? key;
    if (Array.isArray(inner)) {
      // Перечень — без идентификаторов (решение Р-758), в прежнем виде.
      const shown = inner.filter((item) => !isRecordId(item));
      if (String(shown).length > 0) out.push(`${name} ${valueLabel(key, shown)}`);
    } else if (inner !== null && typeof inner === 'object') {
      out.push(...flatten(inner, `${name}: `));
    } else if (inner !== null && inner !== undefined && String(inner).length > 0) {
      // Суммы — рублями, признаки — «да»/«нет» (решения Р-242, Р-244).
      out.push(`${name} ${valueLabel(key, inner)}`);
    }
  }
  return out;
}
