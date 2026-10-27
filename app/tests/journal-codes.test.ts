/**
 * Журнал действий — словами, без машинных кодов (решение Р-766; Р-179,
 * Р-758). Итоговая проверка доработки взаимодействия (Р-762) нашла на
 * экране журнала английские коды: в «Объекте» — «HeadCheck»,
 * «PracticeSetting», «Assignment»; в «Подробностях» — имена полей
 * («approvalDaysFrom», «note», «kind», «via»), значения-коды («было ACTIVE ·
 * стало SUSPENDED», «via AUTO_ACCEPT», «kind TELEGRAM», «thread
 * WORK_INTERNAL»), перечни ключей полей и шагов, даты записью ISO, суммы
 * копейками. Теперь всё это — словами экранов кабинета; коды и
 * идентификаторы остаются в выгрузке CSV.
 *
 * Первая часть — ограничитель по исходнику: каждый вид объекта и каждый
 * ключ данных события, которые пишет `record()`, подписаны, и строковые
 * значения-литералы печатаются словами. Новый код мимо словаря роняет
 * проверку, а не всплывает на экране руководителя.
 */

import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { actionCodes, detailsLabel, objectLabel } from '../src/lib/cabinet/journal-labels.ts';

const APP = path.join(import.meta.dirname, '..');
const SRC = path.join(APP, 'src');
const LIB = path.join(SRC, 'lib', 'cabinet');
const read = (...parts: string[]) => readFileSync(path.join(...parts), 'utf8');

const ID = 'cmvmg0c3400043z7dtvszgs70';

/**
 * Латиница, которой место на экране: название мессенджера. Шаги чек-листа
 * публикаций называют базы «RSCI», «Scopus», «Web of Science» — такие шаги
 * в образцах ниже не берутся.
 */
const ALLOWED = new Set(['Telegram']);

/** Слова латиницей в строке подробностей, кроме допустимых. */
function latinWords(text: string): string[] {
  return (text.match(/[A-Za-z][A-Za-z0-9_]*/gu) ?? []).filter((word) => !ALLOWED.has(word));
}

// ─────────────────────────── Разбор исходника ───────────────────────────

function sources(root: string): string[] {
  return readdirSync(root, { recursive: true })
    .map(String)
    .filter((name) => (name.endsWith('.ts') || name.endsWith('.tsx')) && !name.startsWith('generated'))
    .map((name) => path.join(root, name));
}

/** Конец строки, шаблона или комментария, начатого в `at`; иначе `at`. */
function skip(code: string, at: number): number {
  const c = code[at];
  if (c === '/' && code[at + 1] === '/') return code.indexOf('\n', at) === -1 ? code.length : code.indexOf('\n', at);
  if (c === '/' && code[at + 1] === '*') return code.indexOf('*/', at + 2) + 1;
  if (c === "'" || c === '"' || c === '`') {
    for (let i = at + 1; i < code.length; i += 1) {
      if (code[i] === '\\') i += 1;
      else if (code[i] === c) return i;
    }
  }
  return at;
}

/** Выражение от `start` до запятой или закрывающей скобки своего уровня. */
function expression(code: string, start: number): string {
  let depth = 0;
  for (let i = start; i < code.length; i += 1) {
    const next = skip(code, i);
    if (next !== i) {
      i = next;
      continue;
    }
    const c = code[i]!;
    if ('({['.includes(c)) depth += 1;
    else if (')}]'.includes(c)) {
      if (depth === 0) return code.slice(start, i);
      depth -= 1;
    } else if (c === ',' && depth === 0) return code.slice(start, i);
  }
  return code.slice(start);
}

/** Скобки вызова целиком: от открывающей в `open` до парной. */
function balanced(code: string, open: number): string {
  let depth = 0;
  for (let i = open; i < code.length; i += 1) {
    const next = skip(code, i);
    if (next !== i) {
      i = next;
      continue;
    }
    if ('({['.includes(code[i]!)) depth += 1;
    else if (')}]'.includes(code[i]!) && --depth === 0) return code.slice(open, i + 1);
  }
  return code.slice(open);
}

/** Текст без комментариев: слово в кавычках из пояснения — не вид объекта. */
function uncommented(code: string): string {
  let out = '';
  for (let i = 0; i < code.length; i += 1) {
    const next = skip(code, i);
    out += next !== i && code[i] === '/' ? ' ' : code.slice(i, next + 1);
    i = next;
  }
  return out;
}

/** Объектные литералы верхнего уровня выражения: у тернарного — оба. */
function objectsIn(expr: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let open = -1;
  for (let i = 0; i < expr.length; i += 1) {
    const next = skip(expr, i);
    if (next !== i) {
      i = next;
      continue;
    }
    const c = expr[i]!;
    if (c === '{') {
      if (open === -1) open = i;
      depth += 1;
    } else if (c === '}') {
      depth -= 1;
      if (depth === 0 && open !== -1) {
        out.push(expr.slice(open, i + 1));
        open = -1;
      }
    }
  }
  return out;
}

/** Поля объектного литерала: запятые верхнего уровня. */
function entries(literal: string): string[] {
  const body = literal.slice(1, -1);
  const out: string[] = [];
  let start = 0;
  while (start < body.length) {
    const part = expression(body, start);
    out.push(part.trim());
    start += part.length + 1;
  }
  return out.filter((part) => part !== '');
}

/**
 * Образец данных события по литералу: ключи — как в исходнике, строковый
 * литерал — собой (код должен печататься словом), вложенный литерал —
 * вложенным образцом, всё прочее — числом 1. Развёртка `...(…)` вливает
 * поля своих литералов.
 */
function sample(literal: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const entry of entries(literal)) {
    if (entry.startsWith('...')) {
      for (const inner of objectsIn(entry.slice(3))) Object.assign(out, sample(inner));
      continue;
    }
    const match = /^([A-Za-z_$][\w$]*)\s*(?::\s*([\s\S]*))?$/u.exec(entry);
    assert.ok(match !== null, `поле данных события не разобрано: «${entry}»`);
    const value = match[2]?.trim();
    out[match[1]!] =
      value === undefined
        ? 1
        : value.startsWith('{')
          ? sample(value)
          : /^'[^']*'$/u.test(value)
            ? value.slice(1, -1)
            : 1;
  }
  return out;
}

interface Call {
  readonly where: string;
  readonly actions: string[];
  readonly objects: string[];
  readonly samples: Record<string, unknown>[];
}

const KNOWN = new Set(actionCodes());
const literals = (expr: string) => [...expr.matchAll(/'([^']*)'/gu)].map((hit) => hit[1]!);

/** Записи журнала в исходниках кабинета и в скриптах расписания (Р-202). */
function calls(): Call[] {
  const out: Call[] = [];
  for (const file of [...sources(SRC), ...sources(path.join(APP, 'scripts'))]) {
    const code = read(file);
    for (const hit of code.matchAll(/(?<![\w.])record\(/gu)) {
      if (/function\s+$/u.test(code.slice(Math.max(0, hit.index - 12), hit.index))) continue;
      const call = uncommented(balanced(code, hit.index + 'record'.length));
      const where = `${path.relative(APP, file)}:${code.slice(0, hit.index).split('\n').length}`;
      const field = (name: string) => {
        const at = new RegExp(`\\b${name}:\\s*`, 'u').exec(call);
        return at === null ? '' : expression(call, at.index + at[0].length);
      };
      out.push({
        where,
        actions: literals(field('action')).filter((code) => KNOWN.has(code)),
        objects: literals(field('objectType')),
        samples: objectsIn(field('payload')).map(sample),
      });
    }
  }
  return out;
}

const CALLS = calls();

describe('ограничитель: всё, что пишет record(), подписано (Р-766)', () => {
  it('записи журнала найдены, у каждой — действие и вид объекта литералом', () => {
    // Порог — чтобы проверка не прошла впустую при сломанном разборе.
    assert.ok(CALLS.length >= 100, `записей журнала найдено ${CALLS.length}`);
    assert.ok(CALLS.flatMap((call) => call.samples).length >= 80, 'образцов данных события мало');
    for (const call of CALLS) {
      assert.ok(call.actions.length > 0, `${call.where}: действие не названо в словаре журнала`);
      assert.ok(call.objects.length > 0, `${call.where}: вид объекта не литералом`);
    }
  });

  it('каждый вид объекта назван словом', () => {
    const unnamed = new Set<string>();
    for (const call of CALLS) for (const code of call.objects) if (objectLabel(code) === code) unnamed.add(code);
    assert.deepEqual([...unnamed].sort(), [], 'вид объекта пишется в журнал, но не назван по-русски');
  });

  it('каждый ключ данных события и каждое значение-литерал — словами', () => {
    const coded: string[] = [];
    for (const call of CALLS) {
      for (const data of call.samples) {
        // Ключ подписан общим словарём или правилом хотя бы одного из
        // действий записи (у тернарного действия — двух).
        const best = call.actions
          .map((action) => detailsLabel(data, action))
          .sort((a, b) => latinWords(a).length - latinWords(b).length)[0]!;
        if (latinWords(best).length > 0) coded.push(`${call.where}: ${best}`);
      }
    }
    assert.deepEqual(coded, [], 'в подробностях остались коды');
  });
});

// ─────────────────────────── Подробности на образцах ─────────────────────

/**
 * Латиница данных, а не кода: расширение в имени файла книги; код позиции
 * справочника — латиницей по правилу формы, он стоит и на экране
 * «Справочники» (тест Р-758 его оставляет); статья расхода — ключ
 * справочника, название которого живёт только в базе.
 */
const DATA_WORDS = new Set(['xlsx', 'dissertation', 'promotion']);

/** Данные событий — как их пишет сервисный слой, по одному-два на действие. */
const CASES: readonly (readonly [string, Record<string, unknown>, string])[] = [
  [
    'JOURNAL_EXPORTED',
    { rows: 12, truncated: true, filter: { from: '2026-10-01T00:00:00.000Z', to: '2026-10-27T00:00:00.000Z', actorId: ID, action: 'LEAD_EXPORT', projectTitle: false } },
    'строк 12 · выгрузка обрезана да · отбор: с даты 1 октября 2026, по дату 27 октября 2026, по действующему лицу, действие «Заявки выгружены», по названию работы нет',
  ],
  [
    'JOURNAL_EXPORTED',
    { rows: 3, truncated: false, filter: { from: null, to: null, actorId: null, action: 'DOWNLOAD', projectTitle: true } },
    'строк 3 · выгрузка обрезана нет · отбор: действие «скачивание», по названию работы да',
  ],
  ['OUTBOX_RETRY', { eventKind: 'CURATOR_INVITED', userId: ID }, 'уведомление «вам открыт кабинет куратора»'],
  [
    'STAFF_REGALIA_SAVED',
    { position: true, degree: true, specialization: false, code: '5.6.1' },
    'должность да · учёная степень да · научная специальность нет · шифр специальности 5.6.1',
  ],
  [
    'CURATOR_PROFILE_SAVED',
    { changed: ['degree', 'defaultPayout'], defaultPayout: '2500000' },
    'изменено: Учёная степень, Ставка по умолчанию · ставка по умолчанию 25 000 ₽',
  ],
  ['USER_CREATED', { role: 'EXPERT', profile: ['position', 'degree'] }, 'роль куратор · заполнено: Должность, Учёная степень'],
  ['USER_STATUS_CHANGED', { from: 'ACTIVE', to: 'SUSPENDED' }, 'было действует · стало приостановлена'],
  ['EXPERT_NDA_UPDATED', { signedOn: '2025-12-08T00:00:00.000Z' }, 'подписан 8 декабря 2025'],
  ['NDA_REQUESTED', { heads: 2 }, 'уведомлено руководителей 2'],
  ['SERVICE_TYPE_SAVED', { code: 'dissertation', name: 'Диссертация' }, 'код dissertation · название Диссертация'],
  ['CALENDAR_DAY_SAVED', { workday: true }, 'вид дня рабочий'],
  ['CALENDAR_DAY_SAVED', { workday: false }, 'вид дня нерабочий'],
  [
    'NOTIFY_CHANNELS_SAVED',
    { email: true, telegram: false, dailyDigest: true },
    'почта да · Telegram нет · письма о работах — одной сводкой да',
  ],
  [
    'STAGE_APPROVED',
    { from: 'IN_APPROVAL', to: 'DONE', via: 'AUTO_ACCEPT' },
    'было На согласовании у клиента · стало Завершён · этап принят по истечении срока согласования',
  ],
  [
    'STAGE_APPROVED',
    { from: 'IN_APPROVAL', to: 'DONE', via: 'CLIENT_APPROVE', staffLink: true },
    'было На согласовании у клиента · стало Завершён · клиент согласовал этап · вход по ссылке сотрудника да',
  ],
  ['STAGE_STATE_CHANGED', { from: 'IN_PROGRESS', to: 'AWAITING_CLIENT' }, 'было В работе · стало Ждёт материалов клиента'],
  [
    'STAGE_REOPENED',
    { from: 'DONE', to: 'IN_PROGRESS', dueFrom: '2026-10-20', dueTo: '2026-11-03' },
    'было Завершён · стало В работе · срок был 20 октября 2026 · срок стал 3 ноября 2026',
  ],
  ['STAGE_RETURNED', { from: 'IN_APPROVAL', to: 'IN_PROGRESS', contactHint: false }, 'было На согласовании у клиента · стало В работе · есть контакты нет'],
  ['ASSIGNMENT_CREATED', { assigneeId: ID, dueOn: '2026-10-30', project: 'PD-2026-047' }, 'срок 30 октября 2026'],
  ['ASSIGNMENT_STATUS', { from: 'ASSIGNED', to: 'DONE' }, 'было поставлено · стало сделано'],
  [
    'BRIEF_APPLIED',
    { fields: ['topic', 'university'], variant: 'Вариант 2', stageId: ID, attached: true },
    'обновлено: Тема, Вуз или организация (карточка клиента) · вариант темы Вариант 2 · документ приложен к материалам да',
  ],
  ['CONTACT_ADDED', { kind: 'TELEGRAM' }, 'способ Сообщение в Telegram'],
  ['CONTACT_REMOVED', { kind: 'FULL_SUPPORT' }, 'способ Полное сопровождение'],
  ['CONTACT_PREFERRED', { kind: 'PHONE_CALL' }, 'способ Звонок менеджера'],
  ['NOTIFY_RULES_SAVED', { rules: 4 }, 'включено правил 4'],
  [
    'CHECKLIST_MARKED',
    { checklist: 'service-dissertation', added: ['council'], removed: ['abstract'] },
    'чек-лист «Сопровождение диссертационного исследования» · отмечено: «Совет по защите известен; требования совета и организации к оформлению получены» · снято: «Автореферат соответствует тексту диссертации, оформление — по ГОСТ Р 7.0.11-2011»',
  ],
  [
    'ERASURE_REQUESTED',
    { clientId: ID, scope: 'PERSONAL_DATA_AND_FILES', byClient: true, staffLink: true },
    'объём данные и файлы · подано клиентом в кабинете да · вход по ссылке сотрудника да',
  ],
  ['ERASURE_REQUESTED', { clientId: ID, scope: 'PERSONAL_DATA' }, 'объём только данные'],
  [
    'ERASURE_EXECUTED',
    { clientId: ID, projects: 2, objectsPurged: 7, objectsFailed: 1, contractTotal: '24000050' },
    'работ 2 · объектов изъято 7 · объектов не изъято 1 · сумма договоров 240 000,50 ₽',
  ],
  [
    'EXPERT_APPLICATION_REVIEWED',
    { status: { from: 'NEW', to: 'INVITED' }, note: true },
    'состояние: было Новая, стало Приглашён · есть пометка да',
  ],
  ['EXPERT_APPLICATION_DELETED', { files: 2 }, 'файлов 2'],
  [
    'FEEDBACK_REVIEWED',
    { status: { from: 'NEW', to: 'FIXED' }, severity: { from: 'HIGH', to: 'LOW' }, note: false, via: 'key' },
    'состояние: было новое, стало исправлено · критичность: было высокая, стало низкая · есть «Что сделано» нет · по ключу выгрузки',
  ],
  ['FEEDBACK_EXPORTED', { rows: 5, via: 'key' }, 'строк 5 · по ключу выгрузки'],
  ['FINANCE_YEAR_SAVE', { year: 2025, revenue: '125000000', costs: '48000000' }, 'год 2025 · выручка 1 250 000 ₽ · расходы 480 000 ₽'],
  [
    'FINANCE_YEAR_REMOVE',
    { year: 2025, revenue: '125000000', costs: '48000000', note: 'разовый заказ' },
    'год 2025 · выручка 1 250 000 ₽ · расходы 480 000 ₽ · заметка разовый заказ',
  ],
  [
    'CONTRACT_SAVED',
    { number: '12/2026', total: '30000000', numberFrom: '11/2026', totalFrom: '28000000' },
    'номер 12/2026 · сумма договора 300 000 ₽ · номер был 11/2026 · сумма была 280 000 ₽',
  ],
  [
    'TRANCHE_STATUS_CHANGED',
    { from: 'INVOICED', to: 'PAID', amount: '10000000', paidOn: '2026-10-21' },
    'было выставлен счёт · стало оплачен · сумма 100 000 ₽ · дата оплаты 21 октября 2026',
  ],
  [
    'TRANCHE_RESCHEDULED',
    { title: 'Второй транш', from: '2026-10-15', to: '2026-11-15', reason: 'перенос защиты' },
    'название Второй транш · было 15 октября 2026 · стало 15 ноября 2026 · причина перенос защиты',
  ],
  ['TRANCHE_ADDED', { amount: '5000000', plannedDate: '2026-11-01' }, 'сумма 50 000 ₽ · срок 1 ноября 2026'],
  ['PAYOUT_PAID', { amount: '2500000', paidOn: '2026-10-25' }, 'сумма 25 000 ₽ · дата оплаты 25 октября 2026'],
  ['HEAD_CHECK_CLOSED', { kind: 'CONTRACT_BY_MANAGER', note: 'проверено' }, 'дело «Проверьте договор» · отметка проверено'],
  [
    'IMPORT_APPLIED',
    { fileName: 'Книга.xlsx', created: 5, updated: 1, skipped: 2, rejected: 0 },
    'файл Книга.xlsx · заведено 5 · обновлено 1 · пропущено 2 · отклонено 0',
  ],
  ['CLIENT_MERGED', { into: ID, projects: 3 }, 'работ перенесено 3'],
  ['LEAD_STATUS_CHANGED', { from: 'NEW', to: 'CONSULTED' }, 'было Новая · стало Консультация проведена'],
  ['LEAD_EDITED', { fields: ['name', 'organization'] }, 'исправлено: Имя, Организация или вуз'],
  ['VERSION_UPLOADED', { material: ID, version: 3, moderated: true }, 'версия 3 · ждёт публикации да'],
  ['VERSION_PUBLISHED', { comments: 2 }, 'опубликовано пояснений куратора 2'],
  ['VERSION_REJECTED', { withNote: true }, 'с причиной да'],
  ['MESSAGE_SENT', { thread: 'WORK_INTERNAL' }, 'внутренняя переписка по работе'],
  ['MESSAGE_SENT', { thread: 'HEAD_STAFF' }, 'переписка с руководителем практики'],
  ['TEMPLATE_UPLOADED', { title: 'Договор', audience: 'STAFF' }, 'название Договор · кому команде'],
  ['TEMPLATE_REPLACED', { title: 'Памятка', audience: 'ALL' }, 'название Памятка · кому всем, включая клиентов'],
  ['PRACTICE_SETTING_SAVED', { from: '2024-01-01', to: '2025-01-01' }, 'было 1 января 2024 · стало 1 января 2025'],
  ['PRACTICE_SETTING_SAVED', { from: 1, to: 2 }, 'было 1 · стало 2'],
  // Статья расхода остаётся ключом справочника: её название живёт в базе.
  ['EXPENSE_ADDED', { month: '2026-10', category: 'promotion', amount: '1500000', serviceTypeId: null }, 'месяц окт 2026 · статья promotion · сумма 15 000 ₽'],
  ['LEAD_FILES_MOVED', { count: 2, failed: 1 }, 'перенесено 2 · не перенесено 1'],
  ['LEAD_DECLINED', { letter: true }, 'письмо заявителю да'],
  [
    'PROJECT_EDITED',
    { expertRoleFrom: 'SUBJECT_EXPERT', expertRoleTo: 'METHODOLOGIST' },
    'роль куратора была Куратор по специальности · роль куратора стала Методолог',
  ],
  [
    'PROJECT_EDITED',
    { title: 'Тема', dueFrom: 'без срока', dueTo: '2026-12-01', approvalDaysFrom: 5, approvalDaysTo: 7 },
    'название Тема · срок был без срока · срок стал 1 декабря 2026 · срок согласования был, рабочих дней 5 · срок согласования стал, рабочих дней 7',
  ],
  ['PROJECT_STATUS_CHANGED', { from: 'ACTIVE', to: 'PAUSED' }, 'было Действует · стало Приостановлена'],
  ['PLAN_CHANGED', { moved: { from: 2, to: 4 } }, 'место этапа: было 2, стало 4'],
  ['PLAN_CHANGED', { removed: 3 }, 'удалён этап 3'],
  ['PLAN_CHANGED', { template: 5 }, 'этапов по шаблону 5'],
  ['WORK_RATED', { score: 5, withText: true, publishAllowed: false }, 'оценка 5 · с отзывом да · публикация отзыва на сайте разрешена нет'],
  ['RECOMMENDATION_MARKED', { status: 'POSTPONED' }, 'отметка отложено'],
  [
    'BOOK_PULL',
    { file: 'Книга заказов.xlsx', rows: 40, created: 2, updated: 1, skipped: 37, held: 1, erased: 0, rejected: 0 },
    'файл Книга заказов.xlsx · строк 40 · заведено 2 · обновлено 1 · пропущено 37 · на разбор 1 · стёрто по требованию субъекта 0 · отклонено 0',
  ],
  ['DISK_SYNC', { uploaded: 3, removed: 1, failed: 0, files: 120, scope: 'tables' }, 'ушло 3 · удалено 1 · ошибок 0 · в зеркале 120 · объём только таблицы реестров'],
];

describe('подробности журнала словами, суммы рублями (Р-766)', () => {
  for (const [action, data, expected] of CASES) {
    it(`${action}: ${expected}`, () => {
      const text = detailsLabel(data, action);
      // Суммы пишутся с неразрывными пробелами разрядов (`formatAmount`).
      assert.equal(text.replace(/[\u00a0\u202f]/gu, ' '), expected);
      // Ни кода прописными, ни ключа поля camelCase (кроме названия Telegram).
      assert.doesNotMatch(text, /[A-Z][A-Z_]{2,}/u);
      assert.doesNotMatch(text, /[a-z][A-Z]/u);
      assert.deepEqual(latinWords(text).filter((word) => !DATA_WORDS.has(word)), []);
    });
  }

  it('дата ссылки входа — по Москве, как в столбце «Когда»; выдача с карточки работы — словами', () => {
    const text = detailsLabel({ expiresAt: '2026-10-27T13:45:00.000Z', via: 'project' }, 'ACCESS_LINK_ISSUED');
    assert.match(text, /^действует до 27\.10\.2026, 16:45:00 · вход открыт клиенту на карточке работы$/u);
  });

  it('копейки — рублями у всех сумм: договоры при удалении, годовые итоги, ставка, расход', () => {
    assert.match(detailsLabel({ contractTotal: '100' }, 'ERASURE_EXECUTED'), /сумма договоров 1\s₽/u);
    assert.match(detailsLabel({ revenue: '100', costs: '50' }, 'FINANCE_YEAR_SAVE'), /выручка 1\s₽ · расходы 0,50\s₽/u);
    assert.match(detailsLabel({ changed: ['defaultPayout'], defaultPayout: '300000' }, 'CURATOR_PROFILE_SAVED'), /ставка по умолчанию 3\s000\s₽/u);
    assert.match(detailsLabel({ amount: '99900' }, 'EXPENSE_REMOVED'), /сумма 999\s₽/u);
  });

  it('новые виды объектов — словами', () => {
    assert.deepEqual(
      ['Assignment', 'AuditEvent', 'ContactChannel', 'Expense', 'FileAccessLog', 'HeadCheck', 'LeadAttachment', 'Mirror', 'NotifyRule', 'PracticeSetting', 'RecommendationMark'].map(objectLabel),
      ['поручение', 'журнал действий', 'способ связи', 'расход', 'журнал доступа к файлам', 'дело руководителя', 'вложение заявки', 'зеркало на Диске', 'правила уведомлений', 'настройка практики', 'отметка рекомендации'],
    );
  });

  it('незнакомый код по-прежнему показывается как есть: он честнее догадки (Р-179)', () => {
    assert.equal(detailsLabel({ from: 'SOMETHING_NEW', to: 'DONE' }, 'ASSIGNMENT_STATUS'), 'было SOMETHING_NEW · стало сделано');
    assert.equal(objectLabel('Unknown'), 'Unknown');
  });
});

// ─────────────────────────── Источник подписей один ──────────────────────

describe('подписи из модулей с базой — в чистом модуле, прежние места реэкспортируют (Р-766)', () => {
  const moved: readonly (readonly [string, RegExp, RegExp])[] = [
    ['admin.ts', /export \{ ACCOUNT_STATUS_LABEL as STATUS_LABEL \} from '\.\/code-labels\.ts';/u, /export const STATUS_LABEL\b/u],
    ['assignments.ts', /export \{ ASSIGNMENT_STATUS_LABEL \} from '\.\/code-labels\.ts';/u, /export const ASSIGNMENT_STATUS_LABEL\b/u],
    ['channels.ts', /export \{ CONTACT_LABEL \} from '\.\/code-labels\.ts';/u, /export const CONTACT_LABEL\b/u],
    ['owner-templates.ts', /export \{ AUDIENCE_LABEL \} from '\.\/code-labels\.ts';/u, /export const AUDIENCE_LABEL\b/u],
    ['recommendations.ts', /export \{ MARK_LABEL \} from '\.\/code-labels\.ts';/u, /export const MARK_LABEL\b/u],
    ['head-checks.ts', /export \{ CHECK_TITLE \} from '\.\/code-labels\.ts';/u, /export const CHECK_TITLE\b|const HOW\b/u],
  ];
  for (const [file, reexport, own] of moved) {
    it(`${file}: подпись берётся из code-labels.ts, своего перечня нет`, () => {
      const code = read(LIB, file);
      assert.match(code, reexport);
      assert.doesNotMatch(code, own);
    });
  }

  it('способ согласования в письме о приёмке — из того же перечня, что в журнале', () => {
    assert.match(read(LIB, 'head-checks.ts'), /\$\{APPROVAL_VIA_LABEL\[via\] \?\? 'этап принят'\}/u);
  });

  it('действия журнала доступа к файлам — один перечень для экрана и подробностей', () => {
    const page = read(SRC, 'app', 'cabinet', 'manage', 'audit', 'page.tsx');
    assert.match(page, /FILE_ACTION_LABEL,\n\s+objectLabel,/u);
    assert.doesNotMatch(page, /const FILE_ACTION_LABEL/u);
  });

  it('словарь журнала не тянет модулей с базой: npm test идёт без DATABASE_URL', () => {
    // Обход значимых импортов: `import type` стирается при запуске и базу
    // не загружает, обычный импорт модуля с базой уронил бы загрузку.
    const seen = new Set<string>();
    const walk = (file: string) => {
      if (seen.has(file)) return;
      seen.add(file);
      for (const hit of read(file).matchAll(/^(?:import|export)\s+(?!type\b)[^'"]*?from\s+'(\.[^']+)'/gmu)) {
        let next = path.resolve(path.dirname(file), hit[1]!);
        if (!existsSync(next)) next = `${next.replace(/\.js$/u, '')}.ts`;
        walk(next);
      }
    };
    walk(path.join(LIB, 'journal-labels.ts'));
    const db = [...seen].filter((file) => file.endsWith(`${path.sep}db.ts`) || file.includes(`${path.sep}generated${path.sep}`));
    assert.deepEqual(db, []);
    assert.ok(seen.has(path.join(LIB, 'code-labels.ts')));
  });
});
