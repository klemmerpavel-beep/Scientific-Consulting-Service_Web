/**
 * Сайт (Р-787): на «Аспирантам» и «Студентам» в вопросах есть ответ, с кем
 * заключается договор и с какого года работает практика. Год регистрации
 * общества в ответе совпадает с годом присвоения ОГРН из оферты (цифры 2—3
 * номера, приказ ФНС от 31.08.2020 № ЕД-7-14/617@): заявление «с 2016 года»
 * сопровождается носителем, и расхождение с реквизитами не остаётся без
 * пояснения (конкурентный разбор 03.11.2026). На «Компаниям» ответ о сторонах
 * договора уже есть (Р-772) и здесь не меняется.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const DESIGN = path.join(import.meta.dirname, '..', '..', 'design');
const read = (page: string) => readFileSync(path.join(DESIGN, `${page}.dc.html`), 'utf8');

const QUESTION = 'С кем заключается договор и с какого года вы работаете?';

function faqAnswer(html: string, q: string): string | undefined {
  const data = html.slice(html.indexOf('const faqData = ['), html.indexOf('];', html.indexOf('const faqData = [')));
  const m = data.match(new RegExp(`\\['${q.replace(/[?()]/gu, '\\$&')}',\\s*'([^']+)'\\]`, 'u'));
  return m?.[1];
}

describe('ответ о сторонах договора и годе начала работы', () => {
  const offer = read('OfferPage');
  const ogrn = offer.match(/ОГРН\s+(\d{13})/u)?.[1];

  it('ОГРН в оферте найден', () => {
    assert.ok(ogrn, 'в оферте нет ОГРН из 13 цифр');
  });

  for (const page of ['MainPage', 'StudentsPage']) {
    it(page, () => {
      const answer = faqAnswer(read(page), QUESTION);
      assert.ok(answer, `в вопросах нет «${QUESTION}»`);
      assert.match(answer, /ООО «РУСДРОН»/u);
      assert.match(answer, /в оферте/u);
      assert.match(answer, /с 2016 года/u);
      const year = `20${ogrn!.slice(1, 3)}`;
      assert.ok(answer.includes(`зарегистрировано в ${year} году`), `год регистрации в ответе не совпадает с ОГРН (${year})`);
    });
  }
});
