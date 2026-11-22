/**
 * «Аспирантам», «Шесть шагов от заявки до защиты»: строка-описание каждого
 * шага — в редакции владельца 20.11.2026 дословно (решение Р-962). Заголовки
 * шагов не меняются (Р-770). Предлоги и союзы в одну-две буквы — с
 * неразрывным пробелом после них (SKILL §8, Р-939); перед тире — тоже
 * неразрывный. Подробности первых дней остались в панели «Что будет после
 * отправки» у формы (Р-885), поэтому шаги не повторяют её дословно.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const ROOT = path.join(import.meta.dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(path.join(ROOT, ...parts), 'utf8');
/** Без неразрывных пробелов и «склейки слов» (U+2060) — так сверяется редакция владельца. */
const plain = (s: string) => s.replace(/ /gu, ' ').replace(/⁠/gu, '');

/** Утверждено владельцем 20.11.2026 (ответ на пакет вопросов, В-3, вариант 1). */
export const APPROVED: ReadonlyArray<readonly [string, string]> = [
  ['Заявка и ответ менеджера', 'Ответ в течение рабочего дня, Пн—Пт 10:00—19:00.'],
  ['Личный кабинет', 'Материалы — по перечню «Что подготовить».'],
  ['Куратор и созвон знакомства', 'Куратор со степенью по вашей специальности, созвон — до 20 минут.'],
  ['Итог консультации и Задание', 'Состав работ, календарный план и стоимость по этапам — в Задании.'],
  ['Этапы с приёмкой', 'Куратор разбирает главы, текст пишете вы.'],
  ['Подготовка к защите', 'Репетиция ответов на вопросы совета и разбор замечаний рецензентов.'],
];

/** Строки stepData: [номер, заголовок, срок, текст]. */
export function stepRows(source: string): Array<{ title: string; text: string }> {
  const at = source.indexOf('const stepData = [');
  assert.ok(at >= 0, 'нет stepData');
  const block = source.slice(at, source.indexOf('];', at));
  return [...block.matchAll(/\['0\d', '([^']+)', '[^']*', '([^']*)'\]/gu)].map((m) => ({ title: m[1]!, text: m[2]! }));
}

describe('«Шесть шагов» «Аспирантам»: строки шагов в редакции владельца (Р-962)', () => {
  for (const [where, source] of [
    ['макет', read('design', 'MainPage.dc.html')],
    ['компонент', read('app', 'src', 'components', 'pages', 'PostgradPage.tsx')],
  ] as const) {
    it(`${where}: заголовки прежние, тексты — дословно`, () => {
      const rows = stepRows(source);
      // Р-1005: в заголовках шагов предлоги и союзы тоже с неразрывным пробелом — слова сверяются без него.
      assert.deepEqual(rows.map((r) => [plain(r.title), plain(r.text)]), APPROVED.map(([t, x]) => [t, x]));
    });

    it(`${where}: после предлогов и союзов в одну-две буквы и перед тире — неразрывный пробел`, () => {
      for (const { title, text } of stepRows(source)) {
        const loose = text.match(/(?:^|[\s ])(?:[ВвКкСсУуОоИиАа]|[Вв]о|[Сс]о|[Нн]а|[Пп]о|[Дд]о|[Оо]т|[Зз]а|[Ии]з|[Оо]б|[Нн]е|[Нн]и) (?=\S)/u);
        assert.equal(loose, null, `${title}: обычный пробел после «${loose?.[0]?.trim()}»`);
        assert.doesNotMatch(text, / —/u, `${title}: перед тире обычный пробел`);
      }
    });
  }

  it('проба: прежняя редакция и обычный пробел ловятся', () => {
    const probe = "const stepData = [\n      ['01', 'Заявка и ответ менеджера', '', 'Менеджер отвечает в течение рабочего дня'],\n    ];";
    const rows = stepRows(probe);
    assert.equal(rows.length, 1);
    assert.notEqual(plain(rows[0]!.text), APPROVED[0]![1]);
    assert.match(rows[0]!.text, /(?:^|[\s ])в (?=\S)/u);
  });
});
