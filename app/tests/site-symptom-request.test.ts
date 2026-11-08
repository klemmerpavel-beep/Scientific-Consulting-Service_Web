/**
 * Сайт (Р-791): у перечня симптомов — переход к заявке. Под перечнем «Где
 * работа обычно останавливается» на «Аспирантам» и под «Семью причинами
 * возврата с нормоконтроля» на «Студентам» стоит карточка-ссылка на форму
 * `#request` с контекстной формулировкой (навык сайта, §4: контекстные
 * формулировки ведут в ту же форму). Приём взят из конкурентного разбора
 * 03.11.2026: посетитель узнаёт свою ситуацию и сразу видит следующий шаг.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const ROOT = path.join(import.meta.dirname, '..', '..');
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8');

const CASES = [
  {
    page: 'MainPage',
    component: 'app/src/components/pages/PostgradPage.tsx',
    start: 'Где работа обычно останавливается',
    after: '</ol>',
    end: '</div>',
    label: 'Разобрать, где остановилась ваша работа',
  },
  {
    page: 'StudentsPage',
    component: 'app/src/components/pages/StudentsPage.tsx',
    // С Р-843 причины — открытым разделом #norm, а не свёрткой.
    start: '<section id="norm"',
    after: '<sc-for list="{{ normchecks }}"',
    end: '</section>',
    label: 'Разобрать замечания нормоконтроля',
  },
] as const;

describe('переход к заявке у перечня симптомов', () => {
  for (const c of CASES) {
    it(`${c.page}: ссылка «${c.label}» ведёт к форме`, () => {
      const html = read(`design/${c.page}.dc.html`);
      const from = html.indexOf(c.start);
      assert.ok(from > 0, `нет блока «${c.start}»`);
      const after = html.indexOf(c.after, from);
      assert.ok(after > from, 'нет перечня симптомов');
      const block = html.slice(after, html.indexOf(c.end, html.indexOf('</a>', after)) + c.end.length);
      // Класс pd-lift обязателен; рядом может стоять класс раскладки (Р-826: pd-diag-cta).
      const link = block.match(/<a class="pd-lift(?: [a-z-]+)*" href="#request"[^>]*>([\s\S]*?)<\/a>/u);
      assert.ok(link, 'под перечнем нет карточки-ссылки на #request');
      assert.ok(link[1]!.replace(/<[^>]+>/gu, '').includes(c.label), `надпись ссылки — не «${c.label}»`);
      assert.match(html, /<section id="request"/u, 'на странице нет формы #request');
    });

    it(`${c.page}: ссылка перенесена в компонент`, () => {
      const tsx = read(c.component);
      const at = tsx.indexOf(c.label);
      assert.ok(at > 0, `в компоненте нет «${c.label}»`);
      const anchor = tsx.lastIndexOf('<a ', at);
      assert.match(tsx.slice(anchor, at), /href="#request"/u, 'ссылка в компоненте ведёт не к #request');
    });
  }
});
