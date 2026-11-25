/**
 * Запрещённые слова — во всём макете страницы, а не только в видимом
 * тексте (Р-957). Прежние проверки читали видимые разделы, и слово
 * «вычитка» в свёрнутом перечне услуг «Аспирантам» (Р-549, Р-785) и
 * «гарантии» в доступных именах ленты посадочной (ч. 3 ст. 5 ФЗ
 * «О рекламе», правило проекта о словах) прошли мимо них: перечень до
 * раскрытия скрыт, а доступное имя не видно глазом, но его зачитывает
 * программа чтения с экрана.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { bind } from './helpers/short-words.ts';

const DESIGN = path.join(import.meta.dirname, '../../design');
// С Р-1015 и Р-1016 — и страница контактов, и посадочные кластеров.
const PAGES = ['StartPage', 'MainPage', 'StudentsPage', 'BusinessPage', 'ExpertsPage', 'ToolsPage', 'NotFoundPage', 'ContactsPage', 'CandidatePage', 'NiokrPage'];

/** Макет без комментариев: в них решения цитируют запреты дословно. */
function source(page: string): string {
  return readFileSync(path.join(DESIGN, `${page}.dc.html`), 'utf8')
    .replace(/<!--[\s\S]*?-->/gu, '')
    .replace(/\/\*[\s\S]*?\*\//gu, '')
    .replace(/(^|[^:'"])\/\/[^\n]*/gu, '$1');
}

// «не гарантируем» — принятое отрицание (решение диссовета не обещается), оно разрешено.
const FORBIDDEN = /вычитк|под[\s ]+ключ|написани[еяю]|редактировани[еяю]|гаранти(?!руем)/iu;

describe('запрещённые слова — во всём макете, включая скрытое и доступные имена (Р-957)', () => {
  for (const page of PAGES) {
    it(page, () => {
      const hit = FORBIDDEN.exec(source(page));
      assert.equal(hit, null, hit ? `${page}: «${source(page).slice(Math.max(0, hit.index - 60), hit.index + 40)}»` : '');
    });
  }

  it('«Аспирантам»: в перечне услуг — «Научная экспертиза текста» без «вычитки»', () => {
    assert.ok(source('MainPage').includes(bind("'Научная экспертиза текста', 'Проверка на заимствования")));
  });

  // Р-992: ленты «Обязательства и документы» больше нет — шесть пунктов стоят
  // карточкой-списком, и её доступные имена ушли вместе с ней. У оставшейся ленты
  // «Что входит в сопровождение» имена стрелок прежние, без «гарантий».
  it('посадочная: ленты «Обязательства и документы» нет, стрелки ленты «Что входит» названы без «гарантий»', () => {
    const start = source('StartPage');
    assert.doesNotMatch(start, /data-carousel="grt"|aria-label="Обязательства и документы/u);
    for (const label of ['Предыдущие карточки', 'Следующие карточки']) {
      assert.ok(start.includes(`aria-label="${label}"`), label);
    }
  });
});
