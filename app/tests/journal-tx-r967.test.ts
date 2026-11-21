/**
 * Строка журнала — в транзакции действия: справочники, учётные записи,
 * способы связи, настройки практики, годы, расходы и шаблоны практики
 * (аудит кабинета 15.11.2026, находка Ф-15; решение Р-967, продолжение
 * Р-937 и Р-938).
 *
 * Опись идёт по всем исходникам `lib/cabinet`, с подкаталогами: каждый
 * вызов `record(…)` разбирается до третьего аргумента. Вызов, третьим
 * аргументом которого не стоит соединение транзакции `tx`, пишет строку
 * журнала отдельной записью. Такие вызовы перечислены ниже поимённо, с
 * классом: «а» — журнал единственная запись действия (выгрузка,
 * скачивание), транзакция не нужна; «б», «в», «г» — следующими выпусками.
 * Новый вызов вне транзакции роняет проверку: его либо переводят в
 * транзакцию, либо вносят в перечень с классом.
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const LIB = path.join(import.meta.dirname, '../src/lib/cabinet');

/** Файлы, переведённые решением Р-967. */
const MOVED = ['admin.ts', 'channels.ts', 'practice-settings.ts', 'finance-years.ts', 'profit.ts', 'owner-templates.ts'] as const;

/**
 * Класс «а»: журнал — единственная запись действия (выгрузка, скачивание
 * файла). Транзакции не нужно: откатывать нечего. Остаются вне неё навсегда.
 */
const ONLY_JOURNAL = [
  'expert-applications.ts openExpertFile EXPERT_FILE_DOWNLOADED',
  'expert-applications.ts expertsWorkbook EXPERT_APPLICATIONS_EXPORTED',
  'feedback.ts feedbackWorkbook FEEDBACK_EXPORTED',
  'feedback.ts list FEEDBACK_EXPORTED',
  'queries.ts readLeadAttachment LEAD_FILE_DOWNLOADED',
] as const;

/**
 * Следующими выпусками (Р-967, «Чего решение не закрывает»): «б» — одна
 * запись и строка журнала; «в» — несколько записей или транзакция, после
 * которой идёт строка; «г» — с файлом в хранилище, порядок важен.
 */
const LATER: Readonly<Record<string, 'б' | 'в' | 'г'>> = {
  'approval.ts autoAcceptExpired STAGE_APPROVED': 'в',
  'assignments.ts createAssignment ASSIGNMENT_CREATED': 'в',
  'assignments.ts setAssignmentStatus ASSIGNMENT_STATUS': 'в',
  'auth.ts bindTelegram TELEGRAM_BOUND': 'в',
  'auth.ts unbindTelegram TELEGRAM_UNBOUND': 'б',
  'erasure.ts executeErasure ERASURE_EXECUTED': 'г',
  'expert-applications.ts reviewExpertApplication EXPERT_APPLICATION_REVIEWED': 'б',
  'expert-applications.ts deleteExpertApplication EXPERT_APPLICATION_DELETED': 'г',
  'feedback.ts applyReview FEEDBACK_REVIEWED': 'б',
  'handover.ts handOverStage STAGE_HANDED_OVER': 'в',
  'handover.ts recallHandover STAGE_HANDOVER_RECALLED': 'в',
  'handover.ts handBackStage STAGE_HANDED_BACK': 'в',
  'head-checks.ts closeCheck HEAD_CHECK_CLOSED': 'б',
  'lead-work.ts setLeadStatus LEAD_STATUS_CHANGED': 'б',
  'lead-work.ts editLead LEAD_EDITED': 'б',
  'lead-work.ts addLeadComment LEAD_COMMENTED': 'б',
  'materials.ts uploadVersion VERSION_UPLOADED': 'г',
  'materials.ts commentAftermath COMMENT_CREATED': 'в',
  'materials.ts moderateComment COMMENT_PUBLISHED': 'в',
  'messages.ts sendInternal MESSAGE_SENT': 'в',
  'messages.ts sendCurator MESSAGE_SENT': 'в',
  'messages.ts sendStaff MESSAGE_SENT': 'в',
  'outbox.ts retryLeadLetter OUTBOX_RETRY': 'б',
  'outbox.ts retryFailed OUTBOX_RETRY': 'б',
  'projects.ts moveLeadAttachments LEAD_FILES_MOVED': 'г',
  'projects.ts assignExpert PROJECT_EDITED': 'б',
  'projects.ts acknowledgeReturn STAGE_RETURN_ACKNOWLEDGED': 'б',
  'queries.ts createCabinetRequest REQUEST_VIA_STAFF_LINK': 'в',
  'ratings.ts rateWork WORK_RATED': 'б',
  'recommendations.ts markRecommendation RECOMMENDATION_MARKED': 'в',
  'brief/work-apply.ts applyWorkBrief BRIEF_APPLIED': 'г',
  'import/apply.ts previewBook IMPORT_PREVIEWED': 'б',
  'import/apply.ts applyBatch IMPORT_APPLIED': 'в',
  'import/apply.ts mergeClients CLIENT_MERGED': 'в',
};

/** Действия Р-967: строка журнала — в транзакции. */
const NOW_IN_TX: Readonly<Record<(typeof MOVED)[number], readonly string[]>> = {
  'admin.ts': [
    'openClientAccess CLIENT_EMAIL_ADDED',
    'retryCuratorInvite OUTBOX_RETRY',
    'saveRegalia STAFF_REGALIA_SAVED',
    'saveCuratorProfile CURATOR_PROFILE_SAVED',
    'saveOwnConsent CURATOR_CONSENT_GIVEN',
    'signExpertNda EXPERT_NDA_UPDATED',
    'requestNda NDA_REQUESTED',
    'saveServiceType SERVICE_TYPE_SAVED',
    'addAlias SERVICE_TYPE_ALIAS_ADDED',
    'removeAlias SERVICE_TYPE_ALIAS_REMOVED',
    'saveCalendarDay CALENDAR_DAY_SAVED',
    'removeCalendarDay CALENDAR_DAY_REMOVED',
    'saveStageTemplateItem STAGE_TEMPLATE_SAVED',
    'removeStageTemplateItem STAGE_TEMPLATE_REMOVED',
    'saveOwnChannels NOTIFY_CHANNELS_SAVED',
  ],
  'channels.ts': [
    'addContact CONTACT_ADDED',
    'dropContact CONTACT_REMOVED',
    'preferContact CONTACT_PREFERRED',
    'setFullSupport CONTACT_ADDED',
    'saveRules NOTIFY_RULES_SAVED',
  ],
  'practice-settings.ts': [
    'writeReaction PRACTICE_SETTING_SAVED',
    'saveSetting PRACTICE_SETTING_SAVED',
    'saveShowcaseConsentText SHOWCASE_CONSENT_TEXT_SAVED',
  ],
  'finance-years.ts': ['saveYear FINANCE_YEAR_SAVE', 'removeYear FINANCE_YEAR_REMOVE'],
  'profit.ts': ['addExpense EXPENSE_ADDED', 'removeExpense EXPENSE_REMOVED'],
  'owner-templates.ts': ['saveOwnerTemplate TEMPLATE_UPLOADED', 'removeOwnerTemplate TEMPLATE_REMOVED'],
};

/** Исходники `lib/cabinet` с подкаталогами — путями от него. */
function sources(): string[] {
  return readdirSync(LIB, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
    .map((entry) => path.relative(LIB, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'))
    .sort();
}

/**
 * Аргументы вызова верхнего уровня: от открывающей скобки до парной
 * закрывающей. Скобки внутри строк и шаблонов не считаются.
 */
function argumentsAt(text: string, open: number): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = open + 1;
  let quote: string | null = null;
  const templates: number[] = [];
  for (let i = open; i < text.length; i += 1) {
    const ch = text[i]!;
    if (quote !== null) {
      if (ch === '\\') i += 1;
      else if (quote === '`' && ch === '$' && text[i + 1] === '{') {
        templates.push(depth);
        quote = null;
        depth += 1;
        i += 1;
      } else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') quote = ch;
    else if (ch === '(' || ch === '[' || ch === '{') depth += 1;
    else if (ch === ')' || ch === ']' || ch === '}') {
      depth -= 1;
      if (ch === '}' && templates.at(-1) === depth) {
        templates.pop();
        quote = '`';
      } else if (depth === 0) {
        parts.push(text.slice(start, i));
        return parts.map((part) => part.trim()).filter((part) => part !== '');
      }
    } else if (ch === ',' && depth === 1) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  throw new Error('вызов не закрыт');
}

interface Call {
  readonly file: string;
  readonly fn: string;
  readonly action: string;
  readonly inTx: boolean;
  readonly line: number;
}

/** Вызовы `record(…)` файла: функция, действие и признак транзакции. */
function calls(file: string): Call[] {
  const text = readFileSync(path.join(LIB, file), 'utf8');
  const lines = text.split('\n');
  const found: Call[] = [];
  let fn = '';
  let offset = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    const head = /^(?:export )?async function (\w+)|^\s+async (\w+)\(/u.exec(line);
    if (head !== null) fn = head[1] ?? head[2]!;
    const trimmed = line.trim();
    const skip = trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('import ') || /function record\(/u.test(line);
    if (!skip) {
      for (const match of line.matchAll(/(?<![\w.])record\(/gu)) {
        const args = argumentsAt(text, offset + match.index + 'record'.length);
        const action = /action: (?:[^,\n]*\? )?'([A-Z_]+)'/u.exec(args[1] ?? '')?.[1] ?? '?';
        found.push({ file, fn, action, inTx: args[2] === 'tx', line: i + 1 });
      }
    }
    offset += line.length + 1;
  }
  return found;
}

const key = (call: Call) => `${call.file} ${call.fn} ${call.action}`;
const outside = (file: string) => calls(file).filter((call) => !call.inTx).map(key);

/** Тело каждой транзакции файла: от `prisma.$transaction(async (tx) => {` до её закрытия. */
function transactions(file: string): { at: number; name: string | null; body: string[] }[] {
  const lines = readFileSync(path.join(LIB, file), 'utf8').split('\n');
  const found: { at: number; name: string | null; body: string[] }[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const open = /^(\s*)(?:(?:const|let) (\w+) = |\w+ = |return )?(?:await )?prisma\.\$transaction\(async \(tx\) => \{$/u.exec(lines[i]!);
    if (open === null) continue;
    const indent = open[1]!;
    let end = i + 1;
    while (lines[end] !== `${indent}});` && !lines[end]!.startsWith(`${indent}}, `)) end += 1;
    found.push({ at: i + 1, name: open[2] ?? null, body: lines.slice(i + 1, end) });
  }
  return found;
}

describe('строка журнала — в транзакции действия (Р-967)', () => {
  it('разбор вызова находит третий аргумент и на одной строке, и на нескольких', () => {
    const one = "await record(actor, { action: 'A', payload: { text: `${a}, ${b}` } }, tx);";
    assert.deepEqual(argumentsAt(one, one.indexOf('(')).slice(2), ['tx']);
    const many = "await record(\n  actor,\n  { action: 'B', objectId: f(x, y) },\n  db,\n);";
    assert.deepEqual(argumentsAt(many, many.indexOf('(')), ['actor', "{ action: 'B', objectId: f(x, y) }", 'db']);
    const two = "await record(actor, { action: 'C', note: 'a, b)' });";
    assert.equal(argumentsAt(two, two.indexOf('(')).length, 2);
  });

  it('в переведённых файлах вне транзакции — только действия класса «а»', () => {
    for (const file of MOVED) {
      // Класс «а» в этих файлах не встречается: перечень пуст и задан явно.
      const allowed = ONLY_JOURNAL.filter((entry) => entry.startsWith(`${file} `));
      assert.deepEqual(outside(file), allowed, `${file}: строка журнала вне транзакции`);
    }
  });

  it('каждое действие Р-967 пишет строку журнала соединением транзакции', () => {
    for (const file of MOVED) {
      const inside = calls(file)
        .filter((call) => call.inTx)
        .map((call) => `${call.fn} ${call.action}`);
      for (const action of NOW_IN_TX[file]) {
        assert.ok(inside.includes(action), `${file}: вне транзакции ${action}`);
      }
    }
  });

  it('опись всего кабинета: вне транзакции — только перечисленное, с классом', () => {
    const found = sources().flatMap(outside).sort();
    const listed = [...ONLY_JOURNAL, ...Object.keys(LATER)].sort();
    assert.deepEqual(found, listed);
    // Классы — только «б», «в», «г»; «а» перечислен отдельно.
    for (const [entry, kind] of Object.entries(LATER)) assert.match(kind, /^[бвг]$/u, entry);
    assert.equal(ONLY_JOURNAL.length + Object.keys(LATER).length, 39);
  });

  it('до записи журнала транзакция не выходит: ранний выход оставил бы действие без строки', () => {
    for (const file of MOVED) {
      for (const { at, body } of transactions(file)) {
        const first = body.findIndex((line) => /(?<![\w.])record\(/u.test(line) && !line.trim().startsWith('//'));
        if (first === -1) continue;
        const early = body.slice(0, first).findIndex((line) => !line.trim().startsWith('//') && /\breturn\b/u.test(line));
        assert.equal(early, -1, `${file}:${at + 1 + early}: выход из транзакции до записи журнала`);
      }
    }
  });

  it('в каждой транзакции переведённых файлов есть строка журнала', () => {
    // Транзакция без строки журнала в этих файлах — признак записи,
    // оставшейся снаружи (`saveResponseTerms` пишет её в помощниках).
    for (const file of MOVED) {
      for (const { at, body } of transactions(file)) {
        const text = body.join('\n');
        assert.ok(
          /(?<![\w.])record\(/u.test(text) || /\b(?:writeReaction|saveSetting)\([^;]*\btx,?\s*\)/u.test(text),
          `${file}:${at}: транзакция без строки журнала`,
        );
      }
    }
  });

  it('запись в транзакции не обращается к её результату: он ещё не получен', () => {
    for (const file of MOVED) {
      for (const { at, name, body } of transactions(file)) {
        if (name === null) continue;
        if (body.some((line) => new RegExp(`^\\s*(?:const|let) ${name}\\b`, 'u').test(line))) continue;
        const use = body.findIndex(
          (line) => !line.trim().startsWith('//') && new RegExp(`(?<![\\w.'\`])${name}\\b(?!:)`, 'u').test(line),
        );
        assert.equal(use, -1, `${file}:${at + 1 + use}: «${name}» читается внутри своей транзакции`);
      }
    }
  });

  it('настройки практики пишутся только соединением транзакции', () => {
    const source = readFileSync(path.join(LIB, 'practice-settings.ts'), 'utf8');
    // Помощники требуют соединение: запасного «= prisma» больше нет.
    assert.match(source, /async function writeReaction\(actor: Actor, value: number, before: number, tx: Tx\)/u);
    assert.match(source, /async function saveSetting\(actor: Actor, key: string, value: string, before: string, tx: Tx\)/u);
    assert.doesNotMatch(source, /= prisma\)/u);
    // Каждый вызов помощника передаёт соединение транзакции.
    const uses = [...source.matchAll(/await (writeReaction|saveSetting)\(/gu)];
    assert.ok(uses.length >= 5);
    for (const use of uses) {
      assert.deepEqual(argumentsAt(source, use.index + use[0].length - 1).at(-1), 'tx', `${use[1]} без транзакции`);
    }
  });

  it('договор поручения и «Сообщить руководителю»: письма и гашение очереди — той же транзакцией', () => {
    const source = readFileSync(path.join(LIB, 'admin.ts'), 'utf8');
    for (const name of ['signExpertNda', 'requestNda']) {
      const start = source.indexOf(`export async function ${name}(`);
      const body = source.slice(start, source.indexOf('\n}\n', start));
      assert.match(body, /await prisma\.\$transaction\(async \(tx\) => \{/u, name);
      assert.doesNotMatch(body, /\bprisma\.(?!\$transaction)\w+\.(?:create|update|upsert|delete)\w*\(/u, `${name}: запись мимо транзакции`);
      assert.doesNotMatch(body, /enqueue\(prisma|pruneCuratorDigests\(\s*prisma/u, `${name}: письмо мимо транзакции`);
    }
  });

  it('шаблон практики: файл до транзакции, прежний объект — после фиксации', () => {
    const source = readFileSync(path.join(LIB, 'owner-templates.ts'), 'utf8');
    const save = source.slice(source.indexOf('export async function saveOwnerTemplate('), source.indexOf('export async function removeOwnerTemplate('));
    const put = save.indexOf('await storage().put(key');
    const tx = save.indexOf('await prisma.$transaction(async (tx) => {');
    const close = save.indexOf('\n    });\n', tx);
    const old = save.indexOf('await storage().remove(saved.replaced)');
    assert.ok(put > 0 && put < tx, 'файл кладётся до строки');
    assert.ok(close > tx && old > close, 'прежний объект убирается после фиксации');
    // Отказ транзакции убирает новый объект.
    assert.match(save, /\} catch \(error\) \{\n\s+await storage\(\)\.remove\(key\)\.catch\(\(\) => undefined\);\n\s+throw error;/u);
    const remove = source.slice(source.indexOf('export async function removeOwnerTemplate('), source.indexOf('export async function ownerTemplateFile('));
    assert.ok(
      remove.indexOf('await storage().remove(row.storageKey)') > remove.indexOf('\n  });\n'),
      'объект шаблона убирается после фиксации пометки',
    );
  });
});
