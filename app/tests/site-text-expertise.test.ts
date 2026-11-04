/**
 * Сайт (решение Р-785, П-27): «научная редактура» на посадочных может
 * читаться как работа над текстом за клиента. Во всех видимых текстах
 * содержательных страниц — «научная экспертиза текста»: роль куратора,
 * карточки услуг (в том числе диплома), лиды, мета-описания. Правовые
 * страницы (`/offer`, `/privacy`, `/consent`) не меняются ни на символ
 * (CONTRIBUTING, правило 3) и в проверку не входят.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const ROOT = path.join(import.meta.dirname, '..', '..');
const read = (relative: string) => readFileSync(path.join(ROOT, relative), 'utf8');

/** Содержательные страницы: макет, перенесённый компонент и метаданные. */
const PAGES = [
  ['StartPage', 'StartPage'],
  ['MainPage', 'PostgradPage'],
  ['StudentsPage', 'StudentsPage'],
  ['BusinessPage', 'BusinessPage'],
  ['ExpertsPage', 'ExpertsPage'],
  ['NotFoundPage', 'NotFoundPage'],
] as const;

/** «научная редактура» в любом падеже, через обычный или неразрывный пробел. */
const EDITING = /научн[а-яё]*[\s ]+редактур/iu;

/** Текст без тегов, неразрывный пробел — обычный. */
const plain = (html: string) => html.replace(/<[^>]+>/gu, '').replace(/ /gu, ' ');

describe('«научная редактура» не встречается на страницах сайта (Р-785)', () => {
  for (const [design, component] of PAGES) {
    it(design, () => {
      const sources = {
        [`design/${design}.dc.html`]: read(`design/${design}.dc.html`),
        [`app/src/components/pages/${component}.tsx`]: read(`app/src/components/pages/${component}.tsx`),
      };
      if (design !== 'ExpertsPage' && design !== 'NotFoundPage') {
        sources[`app/src/components/pages/${component}.meta.ts`] = read(`app/src/components/pages/${component}.meta.ts`);
      }
      for (const [file, source] of Object.entries(sources)) {
        const hit = EDITING.exec(source);
        assert.equal(hit, null, `${file}: «${hit ? source.slice(Math.max(0, hit.index - 40), hit.index + 40) : ''}»`);
      }
    });
  }

  it('правовые страницы не тронуты: оферта называет услугу прежними словами', () => {
    // Оферта — договор в редакции юриста; её текст меняется только новой
    // редакцией по решению владельца, не этой правкой.
    assert.match(read('design/OfferPage.dc.html'), EDITING);
  });
});

describe('роль куратора и услуги называют научную экспертизу текста (Р-785)', () => {
  const main = plain(read('design/MainPage.dc.html'));
  const students = plain(read('design/StudentsPage.dc.html'));
  const business = plain(read('design/BusinessPage.dc.html'));
  const start = plain(read('design/StartPage.dc.html'));

  it('главная: методологический разбор и научная экспертиза текста — работа куратора', () => {
    // В «Кто сопровождает» профильных страниц с 04.11.2026 снова четыре роли
    // (Р-795): метка направления там — «Научная экспертиза текста».
    for (const [page, html] of [['MainPage', main], ['StudentsPage', students], ['BusinessPage', business]] as const) {
      if (page !== 'BusinessPage') assert.match(html, /Научная экспертиза текста/u, page);
    }
    assert.match(start, /Методологический разбор и научная экспертиза текста — работа куратора\./u);
  });

  it('лиды «Аспирантам» и главной: «проводим научную экспертизу текста»', () => {
    assert.match(main, /Разбираем методологию диссертации, проводим научную экспертизу текста и готовим к защите/u);
    assert.match(start, /Разбираем методологию, проводим научную экспертизу текста и готовим к защите/u);
  });

  it('карточка диплома на «Студентам»: научная экспертиза авторского текста', () => {
    assert.match(students, /'Дипломная работа и ВКР', 'Разбираем структуру и логику глав, проводим научную экспертизу авторского текста,/u);
    assert.match(students, /'Научная экспертиза текста без изменения авторских выводов'/u);
  });

  it('мета-описания «Аспирантам» и «Студентам» — с научной экспертизой текста и не длиннее 160 знаков (Р-775)', () => {
    for (const page of ['MainPage', 'StudentsPage']) {
      const description = /<meta name="description" content="([^"]*)">/u.exec(read(`design/${page}.dc.html`))?.[1] ?? '';
      assert.match(description, /научная экспертиза текста/u, page);
      assert.ok(description.length <= 160, `${page}: ${description.length} знаков`);
    }
  });
});
