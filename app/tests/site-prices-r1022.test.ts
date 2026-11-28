/**
 * Ценовой ориентир на разводящих страницах «Аспирантам» и «Студентам»
 * (решение Р-1022; ответ владельца на квиз 28.11.2026: «Показать на обеих»).
 *
 * - Суммы — нижние границы договоров по виду работ из свода книги заказов,
 *   те же, что на посадочных (Р-1021): второго источника чисел нет.
 * - Ориентир стоит строкой в разделе и повторён в ответе о стоимости —
 *   оттуда он попадает в разметку FAQPage.
 * - «Подбор сметы» на «Студентам» (Р-886) сумм по-прежнему не показывает.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const ROOT = path.join(import.meta.dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(path.join(ROOT, ...parts), 'utf8');
const plain = (text: string) => text.replace(/⁠/gu, '').replace(/ /gu, ' ').replace(/\s+/gu, ' ');
const { FAQ } = await import('../content/faq.generated.ts');

const economy = read('marketing', 'research', '01-экономика-и-сезонность.md');
const lower = (row: string): number => {
  const m = new RegExp(`^\\| ${row} \\|[^\\n]*\\| ([\\d\\u00a0 ]+)–[\\d\\u00a0 ]+ \\|`, 'mu').exec(economy);
  assert.ok(m, `в своде нет строки «${row}»`);
  return Number(m[1]!.replace(/\D/gu, ''));
};
const rub = (n: number) => `${String(n).replace(/\B(?=(\d{3})+$)/gu, ' ')} ₽`;
const sums = (text: string) => [...plain(text).matchAll(/(\d[\d ]*) ₽/gu)].map((m) => Number(m[1]!.replace(/\D/gu, '')));

const HUBS = [
  {
    design: 'MainPage', tsx: 'PostgradPage', route: '/main', question: 'Сколько это стоит?',
    line: 'Сопровождение кандидатской диссертации — от 125 000 ₽, научной статьи — от 20 000 ₽. Смета фиксируется в Задании после разбора материала.',
    prices: [['Сопровождение диссертации', 125000], ['Научные публикации', 20000]],
    section: 'id="services"',
  },
  {
    design: 'StudentsPage', tsx: 'StudentsPage', route: '/students', question: 'Когда и как платить?',
    line: 'Сопровождение ВКР и магистерской диссертации — от 25 000 ₽. Смета фиксируется в Задании после разбора материала.',
    prices: [['Сопровождение ВКР', 25000]],
    section: 'id="cost"',
  },
] as const;

for (const hub of HUBS) {
  const design = read('design', `${hub.design}.dc.html`);
  const markup = design.slice(0, design.indexOf('<script type="text/x-dc"')).replace(/<!--[\s\S]*?-->/gu, '');

  describe(`${hub.route}: ценовой ориентир из свода книги заказов (Р-1022)`, () => {
    it('суммы — нижние границы диапазонов свода', () => {
      for (const [row, amount] of hub.prices) assert.equal(lower(row), amount, row);
    });

    it('строка ориентира одна, стоит в своём разделе, суммы не рвутся', () => {
      const lines = [...markup.matchAll(/<p class="pd-price"[^>]*>([\s\S]*?)<\/p>/gu)];
      assert.equal(lines.length, 1);
      assert.equal(plain(lines[0]![1]!.replace(/<[^>]+>/gu, '')), hub.line);
      for (const [, amount] of hub.prices) {
        assert.ok(lines[0]![1]!.includes(`white-space:nowrap">от ${rub(amount).replace(/ /gu, ' ')}</span>`), String(amount));
      }
      const start = markup.indexOf(hub.section);
      const end = markup.indexOf('</section>', start);
      assert.ok(start > 0 && lines[0]!.index! > start && lines[0]!.index! < end, 'строка вне раздела');
    });

    it('в разметке страницы других сумм нет', () => {
      assert.deepEqual([...new Set(sums(markup))].sort(), hub.prices.map(([, amount]) => amount).sort());
    });

    it('ответ о стоимости называет те же суммы — и разметка FAQPage вместе с ним', () => {
      const answers = FAQ[hub.route]!.filter(({ a }) => /₽/u.test(a));
      assert.equal(answers.length, 1, 'сумма — в одном ответе');
      assert.equal(plain(answers[0]!.q), hub.question);
      assert.deepEqual(sums(answers[0]!.a).sort(), hub.prices.map(([, amount]) => amount).sort());
      assert.ok(design.includes(answers[0]!.a), 'ответ в макете тот же');
    });

    it('компонент перенесён: строка ориентира есть в .tsx', () => {
      assert.ok(read('app', 'src', 'components', 'pages', `${hub.tsx}.tsx`).includes('className="pd-price"'));
    });
  });
}

describe('«Подбор сметы» на «Студентам» сумм не показывает (Р-886 в этой части действует)', () => {
  const design = read('design', 'StudentsPage.dc.html');

  it('в карточках подбора и в данных переключателей рублей нет', () => {
    const est = design.slice(design.indexOf('<div class="sp-est"'), design.indexOf('</section>', design.indexOf('<div class="sp-est"')));
    assert.ok(est.length > 1000);
    assert.doesNotMatch(est, /₽/u);
    for (const name of ['EST_KINDS', 'EST_STAGES', 'EST_TERMS']) {
      const line = new RegExp(`const ${name} = [^\\n]+`, 'u').exec(design);
      assert.ok(line, name);
      assert.doesNotMatch(line[0], /₽/u);
    }
  });

  it('сумма на «Студентам» и на посадочной магистерской — одна и та же', () => {
    const master = read('design', 'MasterPage.dc.html');
    assert.ok(plain(master).includes('от 25 000 ₽') && plain(design).includes('от 25 000 ₽'));
  });
});
