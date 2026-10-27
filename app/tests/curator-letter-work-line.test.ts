/**
 * Письма куратору о ходе этапа называют работу названием, а не одним кодом
 * (решение Р-734). Шесть писем через `notifyExpert` — «возвращён вам»,
 * «ход за вами» (запуск и снова в работе), «снова в работе» после
 * завершения, «согласован», «принят по истечении срока», «клиент вернул с
 * замечаниями» — начинались «Работа PD-….» и две одноимённые работы в них
 * не различались. Первая строка — `workLine(work, false)` (Р-362).
 * `notifyExpert` пишет только куратору с договором поручения (Р-237, Р-455);
 * письма без договора не меняются, темы — тоже (Р-643).
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const LIB = path.join(import.meta.dirname, '..', 'src', 'lib', 'cabinet');

/** Тела писем `notifyExpert(…)` в файле: от вызова до `key:`. */
function letters(file: string): string[] {
  const source = readFileSync(path.join(LIB, file), 'utf8');
  return [...source.matchAll(/notifyExpert\((?:tx|db), \{([\s\S]*?)\n\s+key:/gu)].map((match) => match[1]!);
}

describe('первая строка писем куратору — `workLine` (Р-734)', () => {
  const all = ['handover.ts', 'projects.ts', 'approval.ts'].flatMap((file) => letters(file).map((body) => ({ file, body })));

  it('письма через `notifyExpert` найдены во всех трёх модулях', () => {
    assert.ok(all.length >= 7, `писем: ${all.length}`);
  });

  for (const [index, { file, body }] of all.entries()) {
    it(`${file}, письмо ${index + 1}: работа названа с названием, не одним кодом`, () => {
      assert.doesNotMatch(body, /`Работа \$\{work\.code\}\./u, 'первая строка — один код');
      assert.match(body, /workLine\(work, false\)|`Работа \$\{work\.code\} — \$\{work\.title\}/u);
    });
  }

  it('правило строки — то же, что у писем сотрудникам (Р-362)', () => {
    const source = readFileSync(path.join(LIB, 'work-line.ts'), 'utf8');
    assert.match(source, /`Работа \$\{project\.code\} — \$\{project\.title\}\.`/u);
  });
});

describe('ни одно письмо сотруднику не начинается одним кодом (Р-764)', () => {
  // «Срок этапа изменён» и «Версия vN опубликована» куратору, «Ваше
  // замечание опубликовано» куратору и «Куратор сдал этап» менеджеру шли
  // мимо `notifyExpert` и остались с одной строкой «Работа PD-….».
  // Единственное исключение — письмо о назначении куратору без договора
  // поручения: название работы ему не уходит (Р-237, Р-455).
  const lone = readdirSync(LIB)
    .filter((file) => file.endsWith('.ts'))
    .flatMap((file) =>
      [...readFileSync(path.join(LIB, file), 'utf8').matchAll(/`Работа \$\{[\w.]*code\}\./gu)].map(() => file),
    );

  it('строка «Работа {код}.» — только в письме куратору без договора', () => {
    assert.deepEqual(lone, ['curator-letters.ts']);
  });

  it('письмо о назначении без договора — без названия работы', () => {
    const source = readFileSync(path.join(LIB, 'curator-letters.ts'), 'utf8');
    assert.match(source, /: \[\n\s+`Работа \$\{work\.code\}\.`,\n\s+\.\.\.common,/u);
  });
});
