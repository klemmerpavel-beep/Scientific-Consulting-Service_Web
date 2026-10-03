/**
 * Сайт (требование Т-24, решение Р-318): ссылка «Личный кабинет» в шапке
 * всех восьми страниц; после отправки каждой из восьми форм заявки —
 * строка исхода и под ней, вне `role=status`, блок «Что будет дальше» из
 * трёх шагов, согласованных с письмом «Заявка получена»; формы отзыва не
 * меняются.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const DESIGN = path.join(import.meta.dirname, '..', '..', 'design');
const read = (page: string) => readFileSync(path.join(DESIGN, `${page}.dc.html`), 'utf8');

const PAGES = ['StartPage', 'MainPage', 'StudentsPage', 'BusinessPage', 'OfferPage', 'PrivacyPage', 'ConsentPage', 'NotFoundPage'];
const FORMS: Record<string, readonly string[]> = {
  StartPage: ['top', 'bottom'],
  MainPage: ['top', 'request'],
  StudentsPage: ['top', 'main'],
  BusinessPage: ['top', 'main'],
};
const STEPS = [
  'Куратор разберёт заявку и ответит в течение рабочего дня',
  'Свяжемся удобным вам способом, чтобы уточнить задачу',
  'После согласования откроем вам личный кабинет — ссылка придёт на почту',
];

describe('ссылка «Личный кабинет» в шапке', () => {
  for (const page of PAGES) {
    it(page, () => {
      const html = read(page);
      const header = html.slice(html.indexOf('<header'), html.indexOf('</header>'));
      // На правовых страницах и 404 — тем же элементом, что на главной (О-9).
      const link = [...header.matchAll(/<a href="\.\/cabinet\.html"[^>]*>([\s\S]*?)<\/a>/gu)].map((m) =>
        m[1]!.replace(/<[^>]+>/gu, '').trim(),
      );
      assert.ok(link.includes('Личный кабинет'), 'в шапке нет ссылки «Личный кабинет»');
      if (['OfferPage', 'PrivacyPage', 'ConsentPage', 'NotFoundPage'].includes(page)) {
        assert.match(header, /class="pd-cabinet"/u);
      }
    });
  }
});

describe('«Что будет дальше» после отправки заявки', () => {
  for (const [page, keys] of Object.entries(FORMS)) {
    for (const key of keys) {
      it(`${page} · ${key}`, () => {
        const html = read(page);
        const status = html.indexOf(`data-sent="${key}"`);
        assert.ok(status > 0, 'строки исхода нет');
        const statusEnd = html.indexOf('</div>', status);
        const next = html.indexOf(`data-next="${key}"`);
        assert.ok(next > statusEnd, 'блок шагов внутри role=status или перед ним');
        const block = html.slice(next, html.indexOf('</ol>', next));
        for (const step of STEPS) assert.ok(block.includes(`<li>${step}</li>`), `нет шага «${step}»`);
        const wrapperEnd = html.indexOf('</sc-if>', status);
        assert.ok(next < wrapperEnd, 'блок шагов виден и до отправки');
      });
    }
  }

  it('формы отзыва не меняются', () => {
    for (const page of Object.keys(FORMS)) assert.doesNotMatch(read(page), /data-next="review"/u);
  });
});

describe('сайт не обещает того, чего кабинет не делает (Т-25, Р-319)', () => {
  it('«Состав команды и зоны ответственности», а не «имена»', () => {
    const start = read('StartPage');
    assert.match(start, /Состав команды и зоны ответственности вы получаете до старта работы\./u);
    assert.doesNotMatch(start, /Имена и зоны ответственности/u);
  });

  it('публикации обещаны куратору, а не эксперту: имя эксперта клиенту не раскрывается', () => {
    for (const page of PAGES) assert.doesNotMatch(read(page), /профиль эксперта/iu, page);
    assert.match(read('BusinessPage'), /профиль куратора и список его публикаций вы получаете до договора/u);
  });
});
