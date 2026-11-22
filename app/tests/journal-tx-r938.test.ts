/**
 * Строка журнала — в транзакции действия (аудит 15.11.2026, находка Ф-15;
 * решения Р-937, Р-938). Запись журнала, стоящая после транзакции,
 * терялась при сбое между двумя записями: действие оставалось без
 * сведений, кто и когда его сделал.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const LIB = path.join(import.meta.dirname, '../src/lib/cabinet');

/** Вызовы `record(actor, …)` службы: имя действия и признак транзакции. */
function calls(file: string): { fn: string; action: string; inTx: boolean }[] {
  const lines = readFileSync(path.join(LIB, file), 'utf8').split('\n');
  const found: { fn: string; action: string; inTx: boolean }[] = [];
  let fn = '';
  for (let i = 0; i < lines.length; i += 1) {
    const head = /^(?:export )?async function (\w+)/u.exec(lines[i]!);
    if (head !== null) fn = head[1]!;
    if (!/^\s*await record\($/u.test(lines[i]!) && !/^\s*await record\(actor, \{$/u.test(lines[i]!)) continue;
    const indent = /^\s*/u.exec(lines[i]!)![0];
    let end = i;
    while (!new RegExp(`^${indent}\\}?(?:, tx)?\\);$`, 'u').test(lines[end]!)) end += 1;
    const text = lines.slice(i, end + 1).join('\n');
    const action = /action: (?:[^,\n]*\? )?'([A-Z_]+)'/u.exec(text)?.[1] ?? '?';
    found.push({ fn, action, inTx: /\btx,?\s*\);$/u.test(text) });
  }
  return found;
}

describe('строка журнала — в транзакции действия', () => {
  it('деньги: ни одной записи журнала вне транзакции (Р-937)', () => {
    const outside = calls('finance.ts').filter((call) => !call.inTx);
    assert.deepEqual(outside, []);
    assert.ok(calls('finance.ts').length >= 4);
  });

  it('работы и этапы: вне транзакции — только действия без неё (Р-938)', () => {
    // Смена одной роли куратора и принятие замечаний переведены решением
    // Р-985; перенос вложений заявки — с файлами, К-6.
    const outside = calls('projects.ts').filter((call) => !call.inTx).map((call) => call.fn);
    assert.deepEqual(outside, ['moveLeadAttachments']);
    const inside = calls('projects.ts').filter((call) => call.inTx).map((call) => call.action);
    for (const action of [
      'LEAD_APPROVED',
      'LEAD_DECLINED',
      'EXPERT_ASSIGNED',
      'MANAGER_ASSIGNED',
      'STAGE_CREATED',
      'STAGE_REOPENED',
      'STAGE_EDITED',
      'PROJECT_EDITED',
      'PROJECT_STATUS_CHANGED',
      'STAGE_APPROVED',
      'STAGE_RETURNED',
    ]) {
      assert.ok(inside.includes(action), `в транзакции нет ${action}`);
    }
  });

  it('публикация версии, сообщение клиенту, выдача входа и смена доступа пишут журнал в транзакции (Р-938)', () => {
    const inTx = (file: string) => calls(file).filter((call) => call.inTx).map((call) => call.fn);
    assert.match(readFileSync(path.join(LIB, 'materials.ts'), 'utf8'), /const journal = \(payload: Record<string, unknown>\) =>\n\s+record\(actor, \{[^;]+\}, tx\);/u);
    assert.ok(inTx('messages.ts').includes('sendMessage'));
    for (const fn of ['setUserStatus', 'setUserRole', 'issueAccessLink', 'openClientAccess']) {
      assert.ok(inTx('admin.ts').includes(fn), `вне транзакции ${fn}`);
    }
    // Ссылка входа создаётся тем же соединением, что и строка журнала о ней.
    assert.match(readFileSync(path.join(LIB, 'admin.ts'), 'utf8'), /await manualToken\(user\.id, actor\.id, ip, tx\)/u);
  });

  it('решение о публикации пишет журнал на обоих выходах транзакции: и при отказе', () => {
    const source = readFileSync(path.join(LIB, 'materials.ts'), 'utf8');
    assert.match(source, /await journal\(\{ withNote: reason !== null \}\);\n\s+return 0;/u);
    assert.match(source, /await journal\(\{ comments: clean\.length \}\);\n\s+return clean\.length;/u);
  });

  it('до записи журнала транзакция не выходит: ранний выход оставил бы действие без строки', () => {
    for (const file of ['finance.ts', 'projects.ts', 'materials.ts', 'messages.ts', 'admin.ts']) {
      const lines = readFileSync(path.join(LIB, file), 'utf8').split('\n');
      for (let i = 0; i < lines.length; i += 1) {
        const open = /^(\s*).*prisma\.\$transaction\(async \(tx\) => \{$/u.exec(lines[i]!);
        if (open === null) continue;
        let end = i + 1;
        while (lines[end] !== `${open[1]}});` && !lines[end]!.startsWith(`${open[1]}}, `)) end += 1;
        const body = lines.slice(i + 1, end);
        const first = body.findIndex((line) => /^\s*(?:await )?record\($|^\s*(?:await )?record\(actor, \{/u.test(line));
        if (first === -1) continue;
        const early = body.slice(0, first).findIndex((line) => !line.trim().startsWith('//') && /\breturn\b/u.test(line));
        assert.equal(early, -1, `${file}:${i + 2 + early}: выход из транзакции до записи журнала`);
      }
    }
  });

  it('запись в транзакции не обращается к её результату: он ещё не получен', () => {
    for (const file of ['finance.ts', 'projects.ts', 'materials.ts', 'messages.ts', 'admin.ts']) {
      const lines = readFileSync(path.join(LIB, file), 'utf8').split('\n');
      for (let i = 0; i < lines.length; i += 1) {
        const open = /^(\s*)const (\w+) = await prisma\.\$transaction\(async \(tx\) => \{$/u.exec(lines[i]!);
        if (open === null) continue;
        const [, indent, name] = open;
        let end = i + 1;
        const body: string[] = [];
        while (lines[end] !== `${indent}});`) {
          body.push(lines[end]!);
          end += 1;
        }
        // Имя, объявленное заново внутри транзакции, — другое значение.
        if (body.some((line) => new RegExp(`^\\s*(?:const|let) ${name}\\b`, 'u').test(line))) continue;
        const use = body.findIndex(
          (line) => !line.trim().startsWith('//') && new RegExp(`(?<![\\w.'\`])${name}\\b(?!:)`, 'u').test(line),
        );
        assert.equal(use, -1, `${file}:${i + 2 + use}: «${name}» читается внутри своей транзакции`);
      }
    }
  });
});
