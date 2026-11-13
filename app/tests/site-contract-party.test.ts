/**
 * Сайт (Р-862, прежде Р-792): наименование общества-исполнителя на
 * содержательных страницах не называется — оно, как и реквизиты (Р-404),
 * есть в публичной оферте, политике и согласии. Вопрос о договоре
 * сформулирован по смыслу: «Как заключается договор…» — ответ говорит, что
 * договор заключается по публичной оферте и реквизиты исполнителя — в ней;
 * «с 2016 года» на «Аспирантам» и «Студентам» сохранено. Единственное
 * упоминание общества на содержательных страницах — текст согласия анкеты
 * «Экспертам» (заморожен по 152-ФЗ, CONTRIBUTING, правило 2). Правовые
 * страницы и разметка для поисковиков (OrgSchema) не меняются.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const ROOT = path.join(import.meta.dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(path.join(ROOT, ...parts), 'utf8');
const plain = (source: string) => source.replace(/\u00a0|&nbsp;/gu, ' ').replace(/\u2060/gu, '');
const NAME = /РУСДРОН/u;

const CONTENT = [
  { design: 'StartPage', code: 'StartPage' },
  { design: 'MainPage', code: 'PostgradPage' },
  { design: 'StudentsPage', code: 'StudentsPage' },
  { design: 'BusinessPage', code: 'BusinessPage' },
  { design: 'ExpertsPage', code: 'ExpertsPage' },
  { design: 'NotFoundPage', code: 'NotFoundPage' },
  { design: 'ToolsPage', code: 'ToolsPage' },
] as const;

/** Источник без текста согласия анкеты «Экспертам» — абзаца с «даю согласие ООО „РУСДРОН“». */
function withoutExpertConsent(source: string): string {
  const at = source.search(/даю согласие ООО «РУСДРОН»/u);
  if (at < 0) return source;
  const from = source.lastIndexOf('>', at);
  const to = source.indexOf('<', at);
  return source.slice(0, from) + source.slice(to);
}

/** Ответ на вопрос из данных вопросов макета: ['вопрос', 'ответ']. */
function answer(source: string, question: string): string | undefined {
  const m = plain(source).match(new RegExp(`\\['${question}',\\s*'([^']+)'\\]`, 'u'));
  return m?.[1];
}

describe('Р-862: общество-исполнитель не названо на содержательных страницах', () => {
  for (const page of CONTENT) {
    it(`${page.design}: «РУСДРОН» нет${page.design === 'ExpertsPage' ? ' вне текста согласия анкеты' : ''}`, () => {
      for (const [where, source] of [
        [`design/${page.design}.dc.html`, read('design', `${page.design}.dc.html`)],
        [`${page.code}.tsx`, read('app', 'src', 'components', 'pages', `${page.code}.tsx`)],
      ] as const) {
        const rest = page.design === 'ExpertsPage' ? withoutExpertConsent(source) : source;
        assert.doesNotMatch(rest, NAME, `${where}: наименование общества — только в оферте, политике, согласии`);
      }
    });
  }

  it('«Экспертам»: согласие анкеты не тронуто — общество в нём названо', () => {
    for (const source of [read('design', 'ExpertsPage.dc.html'), read('app', 'src', 'components', 'pages', 'ExpertsPage.tsx')]) {
      assert.match(source, /даю согласие ООО «РУСДРОН» \(ОГРН 1257700248860/u);
    }
  });

  it('правовые страницы и OrgSchema по-прежнему называют исполнителя', () => {
    for (const page of ['OfferPage', 'PrivacyPage', 'ConsentPage']) assert.match(read('design', `${page}.dc.html`), NAME, page);
    assert.match(read('app', 'src', 'components', 'OrgSchema.tsx'), /legalName: 'Общество с ограниченной ответственностью «РУСДРОН»'/u);
  });
});

describe('Р-862: вопрос о договоре — «Как заключается договор…», ответ по публичной оферте', () => {
  for (const page of ['MainPage', 'StudentsPage']) {
    it(`${page}: договор по публичной оферте, реквизиты исполнителя — в оферте, практика — с 2016 года`, () => {
      const html = read('design', `${page}.dc.html`);
      assert.doesNotMatch(plain(html), /С кем заключается договор/u);
      const text = answer(html, 'Как заключается договор и с какого года вы работаете\\?');
      assert.ok(text, 'нет вопроса «Как заключается договор и с какого года вы работаете?»');
      assert.match(text, /^Договор заключается по публичной оферте/u);
      assert.match(text, /реквизиты исполнителя — в оферте/u);
      assert.match(text, /с 2016 года/u);
    });
  }

  it('BusinessPage: договор по форме юриста, реквизиты и общие условия — в публичной оферте', () => {
    const html = read('design', 'BusinessPage.dc.html');
    assert.doesNotMatch(plain(html), /Кто заключает договор/u);
    const text = answer(html.replace(/',\n\s+'/gu, "', '"), 'Как заключается договор и что в нём фиксируется\\?');
    assert.ok(text, 'нет вопроса «Как заключается договор и что в нём фиксируется?»');
    assert.match(text, /^С организацией заключаем договор по форме, согласованной юристом/u);
    assert.match(text, /Реквизиты исполнителя и общие условия — в публичной оферте/u);
  });
});
