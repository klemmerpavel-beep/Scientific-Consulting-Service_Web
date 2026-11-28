/**
 * Ценовой ориентир с разводящих страниц снят (решение Р-1025, указание
 * владельца 28.11.2026 после выката Р-1022: «это убрать»; ответ на квиз —
 * «С обеих разводящих страниц»).
 *
 * - На «Аспирантам» и «Студентам» нет ни строки ориентира, ни сумм в
 *   ответах «Вопросов» — а значит, и в разметке FAQPage.
 * - Цены «от» на трёх посадочных (Р-1021) остаются: их охраняет
 *   site-clusters-r1016.test.ts.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const ROOT = path.join(import.meta.dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(path.join(ROOT, ...parts), 'utf8');
const plain = (text: string) => text.replace(/⁠/gu, '').replace(/ /gu, ' ').replace(/\s+/gu, ' ');
const { FAQ } = await import('../content/faq.generated.ts');

const HUBS = [
  { design: 'MainPage', tsx: 'PostgradPage', route: '/main', question: 'Сколько это стоит?', answer: /^Считаем по этапам после разбора ваших материалов\./u },
  { design: 'StudentsPage', tsx: 'StudentsPage', route: '/students', question: 'Когда и как платить?', answer: /^По этапам\. Стоимость этапов фиксируется в Задании;/u },
] as const;

for (const hub of HUBS) {
  describe(`${hub.route}: ценового ориентира нет (Р-1025)`, () => {
    const design = read('design', `${hub.design}.dc.html`);
    const tsx = read('app', 'src', 'components', 'pages', `${hub.tsx}.tsx`);

    it('строки ориентира нет ни в макете, ни в компоненте', () => {
      for (const source of [design, tsx]) assert.doesNotMatch(source, /pd-price/u);
    });

    it('сумм в рублях нет: ни в разметке, ни в данных сценария', () => {
      for (const source of [design.replace(/<!--[\s\S]*?-->/gu, ''), tsx]) {
        assert.doesNotMatch(plain(source.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//gu, '')), /\d[\d ]*₽|\bот \d[\d ]*(?:руб|р\.)/u);
      }
    });

    it('ответ о стоимости — в редакции до Р-1022, без суммы; разметка FAQPage сумм не несёт', () => {
      const item = FAQ[hub.route]!.find(({ q }) => plain(q) === hub.question);
      assert.ok(item, `нет вопроса «${hub.question}»`);
      assert.match(plain(item.a), hub.answer);
      for (const { a } of FAQ[hub.route]!) assert.doesNotMatch(a, /₽/u);
    });
  });
}

describe('цены «от» на трёх посадочных остаются (Р-1021 в силе)', () => {
  it('кандидатская, магистерская и статья показывают строку цены', () => {
    for (const [design, amount] of [['CandidatePage', 'от 125 000 ₽'], ['MasterPage', 'от 25 000 ₽'], ['ArticlePage', 'от 20 000 ₽']] as const) {
      const text = plain(read('design', `${design}.dc.html`));
      assert.ok(text.includes('class="sv-price"') && text.includes(amount), design);
    }
  });
});
