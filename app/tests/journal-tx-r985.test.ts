/**
 * Строка журнала — в транзакции действия, часть 2 (аудит кабинета
 * 15.11.2026, находка Ф-15; решение Р-985, продолжение Р-937, Р-938 и
 * Р-967): переписка, замечания, заявки, передача этапа, поручения, анкеты
 * кандидатов, автозакрытие этапа, привязка Telegram, оценки,
 * рекомендации, дела руководителя, очередь рассылки, работы, перенос
 * книги — двадцать девять вызовов классов «б» и «в» по описи Р-967.
 *
 * Опись всего `lib/cabinet` с перечнем оставшихся вызовов — в тесте
 * Р-967 (`journal-tx-r967.test.ts`); здесь — что каждое переведённое
 * действие пишет строку соединением транзакции, что транзакция не выходит
 * раньше строки и что письма и сигналы идут тем же соединением.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const LIB = path.join(import.meta.dirname, '../src/lib/cabinet');
const read = (file: string) => readFileSync(path.join(LIB, file), 'utf8');

/** Действия Р-985 по файлам: функция и вид строки журнала. */
const MOVED: Readonly<Record<string, readonly string[]>> = {
  'approval.ts': ['autoAcceptExpired STAGE_APPROVED'],
  'assignments.ts': ['createAssignment ASSIGNMENT_CREATED', 'setAssignmentStatus ASSIGNMENT_STATUS'],
  'auth.ts': ['bindTelegram TELEGRAM_BOUND', 'unbindTelegram TELEGRAM_UNBOUND'],
  'expert-applications.ts': ['reviewExpertApplication EXPERT_APPLICATION_REVIEWED'],
  'feedback.ts': ['applyReview FEEDBACK_REVIEWED'],
  'handover.ts': ['handOverStage STAGE_HANDED_OVER', 'recallHandover STAGE_HANDOVER_RECALLED', 'handBackStage STAGE_HANDED_BACK'],
  'head-checks.ts': ['closeCheck HEAD_CHECK_CLOSED'],
  'lead-work.ts': ['setLeadStatus LEAD_STATUS_CHANGED', 'editLead LEAD_EDITED', 'addLeadComment LEAD_COMMENTED'],
  'materials.ts': ['commentAftermath COMMENT_CREATED', 'moderateComment COMMENT_PUBLISHED'],
  'messages.ts': ['sendInternal MESSAGE_SENT', 'sendCurator MESSAGE_SENT', 'sendStaff MESSAGE_SENT'],
  'outbox.ts': ['retryLeadLetter OUTBOX_RETRY', 'retryFailed OUTBOX_RETRY'],
  'projects.ts': ['assignExpert PROJECT_EDITED', 'acknowledgeReturn STAGE_RETURN_ACKNOWLEDGED'],
  'queries.ts': ['createCabinetRequest REQUEST_VIA_STAFF_LINK'],
  'ratings.ts': ['rateWork WORK_RATED'],
  'recommendations.ts': ['markRecommendation RECOMMENDATION_MARKED'],
  'import/apply.ts': ['previewBook IMPORT_PREVIEWED', 'applyBatch IMPORT_APPLIED', 'mergeClients CLIENT_MERGED'],
};

/**
 * Что в этих файлах остаётся вне транзакции: класс «а» (журнал —
 * единственная запись: выдача файла, выгрузка) навсегда и класс «г» с
 * файлом в хранилище — К-6 выпуска 4 (перечень с классами — в тесте Р-967).
 */
const STAYS_OUTSIDE = [
  'expert-applications.ts deleteExpertApplication EXPERT_APPLICATION_DELETED',
  'expert-applications.ts expertsWorkbook EXPERT_APPLICATIONS_EXPORTED',
  'expert-applications.ts openExpertFile EXPERT_FILE_DOWNLOADED',
  'feedback.ts feedbackWorkbook FEEDBACK_EXPORTED',
  'feedback.ts list FEEDBACK_EXPORTED',
  'materials.ts uploadVersion VERSION_UPLOADED',
  'projects.ts moveLeadAttachments LEAD_FILES_MOVED',
  'queries.ts readLeadAttachment LEAD_FILE_DOWNLOADED',
];

/** Аргументы вызова верхнего уровня; скобки в строках и шаблонах не считаются. */
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
  readonly fn: string;
  readonly action: string;
  readonly inTx: boolean;
}

/** Вызовы `record(…)` файла: функция, вид строки и признак транзакции. */
function calls(file: string): Call[] {
  const text = read(file);
  const lines = text.split('\n');
  const found: Call[] = [];
  let fn = '';
  let offset = 0;
  for (const line of lines) {
    const head = /^(?:export )?async function (\w+)|^\s+async (\w+)\(/u.exec(line);
    if (head !== null) fn = head[1] ?? head[2]!;
    const trimmed = line.trim();
    if (!trimmed.startsWith('//') && !trimmed.startsWith('*') && !trimmed.startsWith('import ')) {
      for (const match of line.matchAll(/(?<![\w.])record\(/gu)) {
        const args = argumentsAt(text, offset + match.index + 'record'.length);
        const action = /action: (?:[^,\n]*\? )?'([A-Z_]+)'/u.exec(args[1] ?? '')?.[1] ?? '?';
        found.push({ fn, action, inTx: args[2] === 'tx' });
      }
    }
    offset += line.length + 1;
  }
  return found;
}

/** Тело функции от объявления до закрывающей скобки в начале строки. */
function body(file: string, fn: string): string {
  const source = read(file);
  const start = source.search(new RegExp(`^(?:export )?async function ${fn}\\(`, 'mu'));
  assert.ok(start >= 0, `${file}: нет функции ${fn}`);
  return source.slice(start, source.indexOf('\n}\n', start));
}

/** Тело каждой транзакции файла: от `prisma.$transaction(async (tx) => {` до её закрытия. */
function transactions(file: string): { at: number; body: string[] }[] {
  const lines = read(file).split('\n');
  const found: { at: number; body: string[] }[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const open = /^(\s*)(?:(?:const|let) \w+ = |return )?(?:await )?prisma\.\$transaction\(async \(tx\) => \{$/u.exec(lines[i]!);
    if (open === null) continue;
    const indent = open[1]!;
    let end = i + 1;
    while (lines[end] !== `${indent}});` && !lines[end]!.startsWith(`${indent}}, `)) end += 1;
    found.push({ at: i + 1, body: lines.slice(i + 1, end) });
  }
  return found;
}

/**
 * Строки тела транзакции с выходом из неё самой: `return` вне вложенных
 * функций (обратный вызов `map` возвращает своё, а не транзакции).
 * Строки, шаблоны и комментарии не разбираются.
 */
function exits(lines: readonly string[]): number[] {
  const found: number[] = [];
  const stack: ('fn' | 'block')[] = [];
  let quote: string | null = null;
  lines.forEach((line, index) => {
    const code = line.trim().startsWith('//') ? '' : line;
    for (let i = 0; i < code.length; i += 1) {
      const ch = code[i]!;
      if (quote !== null) {
        if (ch === '\\') i += 1;
        else if (ch === quote) quote = null;
        continue;
      }
      if (ch === "'" || ch === '"' || ch === '`') quote = ch;
      else if (ch === '{') stack.push(/=>\s*$/u.test(code.slice(0, i)) ? 'fn' : 'block');
      else if (ch === '}') stack.pop();
      else if (code.startsWith('return', i) && !/[\w.]/u.test(code[i - 1] ?? '') && !/\w/u.test(code[i + 6] ?? '') && !stack.includes('fn')) {
        found.push(index);
      }
    }
    // Шаблонная строка в теле транзакции переносится на следующую строку;
    // обычная кавычка — нет.
    if (quote !== '`') quote = null;
  });
  return found;
}

describe('строка журнала — в транзакции действия, часть 2 (Р-985)', () => {
  it('каждое из двадцати девяти действий пишет строку соединением транзакции', () => {
    let total = 0;
    for (const [file, actions] of Object.entries(MOVED)) {
      const inside = calls(file)
        .filter((call) => call.inTx)
        .map((call) => `${call.fn} ${call.action}`);
      for (const action of actions) {
        assert.ok(inside.includes(action), `${file}: вне транзакции ${action}`);
        total += 1;
      }
    }
    assert.equal(total, 29);
  });

  it('в переведённых файлах вне транзакции — только выдача и выгрузка («а») и действия с файлами («г»)', () => {
    const outside = Object.keys(MOVED)
      .flatMap((file) => calls(file).filter((call) => !call.inTx).map((call) => `${file} ${call.fn} ${call.action}`))
      .sort();
    assert.deepEqual(outside, [...STAYS_OUTSIDE].sort());
  });

  it('разбор выхода отличает выход из транзакции от выхода из вложенной функции', () => {
    assert.deepEqual(exits(['    const rows = list.map((row) => {', '      return { row };', '    });', '    return rows;']), [3]);
    assert.deepEqual(exits(["    if (claimed.count === 0) return false;", "    const text = 'return';"]), [0]);
  });

  it('до строки журнала транзакция не выходит; ранний выход — только когда захват не удался и записей нет', () => {
    for (const file of Object.keys(MOVED)) {
      for (const { at, body: lines } of transactions(file)) {
        const first = lines.findIndex((line) => /(?<![\w.])record\(/u.test(line) && !line.trim().startsWith('//'));
        if (first === -1) continue;
        for (const index of exits(lines.slice(0, first))) {
          // Захват по условию не прошёл — ничего не записано, и строки нет:
          // `if (claimed.count === 0) return false;`.
          assert.match(lines[index]!, /^\s*if \(\w+\.count (?:=== 0|!== 1)\) return(?: false)?;$/u, `${file}:${at + 1 + index}: выход из транзакции до записи журнала`);
        }
      }
    }
  });

  it('письма и сигналы переведённых действий идут соединением транзакции, а не мимо неё', () => {
    const helpers = /\b(?:enqueue|notifyCurator|notifyExpert|curatorOnWork|practiceSide|markThread|unreadFor)\(\s*prisma\b/u;
    for (const [file, fns] of [
      ['assignments.ts', ['createAssignment', 'setAssignmentStatus']],
      ['materials.ts', ['addComment', 'moderateComment']],
      ['messages.ts', ['sendInternal', 'sendCurator', 'sendStaff']],
    ] as const) {
      for (const fn of fns) {
        const text = body(file, fn);
        assert.match(text, /prisma\.\$transaction\(async \(tx\) => \{/u, `${fn}: нет транзакции`);
        assert.doesNotMatch(text, helpers, `${fn}: письмо или сигнал мимо транзакции`);
        // Внутри транзакции запись идёт только её соединением.
        const inside = text.slice(text.indexOf('prisma.$transaction('));
        assert.doesNotMatch(inside.slice('prisma.$transaction('.length), /\bprisma\.\w+\.(?:create|update|upsert|delete)\w*\(/u, `${fn}: запись мимо транзакции`);
      }
    }
  });

  it('помощники с соединением: сигналы замечания и сигнал ветки требуют транзакцию, и каждый вызов её передаёт', () => {
    const materials = read('materials.ts');
    assert.match(materials, /async function commentAftermath\([^)]*?\n\s+tx: Prisma\.TransactionClient,\n\): Promise<void>/u);
    const aftermath = [...materials.matchAll(/await commentAftermath\(/gu)];
    assert.equal(aftermath.length, 2, 'замечание и пояснение к версии');
    for (const use of aftermath) assert.equal(argumentsAt(materials, use.index + use[0].length - 1).at(-1), 'tx');

    const messages = read('messages.ts');
    assert.match(messages, /async function signalThread\([^)]*?\n\s+tx: Tx,\n\): Promise<void>/u);
    const signals = [...messages.matchAll(/await signalThread\(/gu)];
    assert.equal(signals.length, 4);
    for (const use of signals) assert.equal(argumentsAt(messages, use.index + use[0].length - 1).at(-1), 'tx');
    // Счёт непрочитанного для сигнала видит новое сообщение: оно лежит в
    // транзакции и снаружи ещё не видно.
    assert.match(messages, /if \(\(await unreadFor\(userId, thread, target, tx\)\) > 1\) continue;/u);
    for (const fn of ['sendInternal', 'sendCurator', 'sendStaff']) {
      assert.match(body('messages.ts', fn), /await markThread\(actor, '[A-Z_]+', \w+, tx\);/u, `${fn}: курсор мимо транзакции`);
    }
  });

  it('заявка из кабинета: согласие, заявка и строка — в транзакции, вложения — после неё', () => {
    const text = body('queries.ts', 'createCabinetRequest');
    const tx = text.indexOf('const lead = await prisma.$transaction(async (tx) => {');
    const consent = text.indexOf('await tx.user.update(');
    const lead = text.indexOf('await tx.lead.create(');
    const journal = text.indexOf("action: 'REQUEST_VIA_STAFF_LINK'");
    const files = text.indexOf('await storage().put(');
    assert.ok(tx > 0 && tx < consent && consent < lead && lead < journal && journal < files);
    assert.doesNotMatch(text, /await prisma\.(?:user\.update|lead\.create)\(/u);
  });

  it('привязка Telegram: погашение метки — в той же транзакции, что привязка и строка', () => {
    const text = body('auth.ts', 'bindTelegram');
    const tx = text.indexOf('return prisma.$transaction(async (tx) => {');
    assert.ok(tx > 0 && tx < text.indexOf('await tx.loginToken.updateMany('));
    assert.doesNotMatch(text, /prisma\.loginToken\.updateMany|prisma\.user\.update/u);
  });
});
