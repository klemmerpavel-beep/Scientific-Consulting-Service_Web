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
import { readFileSync } from 'node:fs';
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
