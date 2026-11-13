/**
 * Карточки условий под снимком кабинета на «Экспертам» (Р-598, Р-618, Р-621;
 * вторая карточка — Р-880). Три ссылки: «Формат» и «Вознаграждение» раскрывают
 * свой ответ в «Вопросах», «Развитие · Растёте вместе с проектами» (выбор
 * владельца 13.11.2026 вместо «Договор · Гражданско-правовой») ведёт к разделу
 * «Как устроена работа» (#how): вопроса о назначении работ в «Вопросах» нет.
 * Слова «гарантия» на странице нет (ч. 3 ст. 5 ФЗ «О рекламе»), у каждого
 * утверждения карточки «Развитие» есть носитель на сайте. Ответ о договоре и
 * конфиденциальности (#ex-faq-6) не менялся.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const ROOT = path.join(import.meta.dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(path.join(ROOT, ...parts), 'utf8');
/** Неразрывный пробел — обычный: фразы сверяются без оглядки на вёрстку. */
const plain = (s: string) => s.replace(/[ ⁠]/gu, ' ').replace(/&nbsp;/gu, ' ');
const HTML = read('design', 'ExpertsPage.dc.html');
const TSX = read('app', 'src', 'components', 'pages', 'ExpertsPage.tsx');
/** Видимый текст фрагмента: без тегов и комментариев. */
const text = (html: string) => plain(html.replace(/<!--[\s\S]*?-->/gu, '').replace(/<[^>]+>/gu, '|')).replace(/\|+/gu, '|');

/** Ряд карточек условий в макете. */
const row = (() => {
  const at = HTML.indexOf('<div class="ex-metrics"');
  assert.ok(at > 0, 'нет ряда карточек условий');
  return HTML.slice(at, HTML.indexOf('</section>', at));
})();
const cards = [...row.matchAll(/<a class="ex-term" href="(#[\w-]+)"(?: onClick="\{\{ (\w+) \}\}")?[^>]*>([\s\S]*?)<\/a>/gu)]
  .map((m) => ({ href: m[1]!, handler: m[2] ?? null, parts: text(m[3]!).split('|').map((t) => t.trim()).filter(Boolean) }));

describe('«Экспертам»: карточки условий под снимком кабинета (Р-880)', () => {
  it('три карточки: «Формат», «Развитие», «Вознаграждение»; первая и третья — к своим ответам, «Развитие» — к #how', () => {
    assert.deepEqual(cards.map((c) => [c.href, c.handler]), [['#ex-faq-4', 'termFormat'], ['#how', null], ['#ex-faq-3', 'termPay']]);
    for (const c of cards) if (c.handler) {
      assert.match(HTML, new RegExp(`${c.handler}: toFaq\\(${c.href.slice('#ex-faq-'.length)}\\),`, 'u'), `${c.handler} раскрывает не свой ответ`);
    }
    assert.ok(/<section id="how"/u.test(HTML), 'нет раздела #how');
    assert.doesNotMatch(HTML, /termContract/u, 'остался обработчик снятой карточки «Договор»');
    assert.doesNotMatch(TSX, /termContract/u, 'в компоненте остался обработчик снятой карточки «Договор»');
  });

  it('«Развитие · Растёте вместе с проектами»: текст выбора владельца, без «гарантии»', () => {
    assert.deepEqual(cards[1]!.parts, [
      'Развитие',
      'Растёте вместе с проектами',
      'Работы по вашей специальности, разбор с методологом, участие в публикациях и НИОКР компаний.',
      'Как устроена работа',
    ]);
    // Предлоги и союзы в одну-две буквы — с неразрывным пробелом.
    assert.ok(row.includes('Растёте вместе с проектами'));
    assert.ok(row.includes('Работы по вашей специальности, разбор с методологом, участие в публикациях и НИОКР компаний.'));
    assert.doesNotMatch(text(HTML), /гаранти/iu, 'на странице «гарантия»');
    assert.doesNotMatch(row, /Гражданско-правовой|договор поручения/u, 'карточка «Договор» осталась');
  });

  it('у утверждений карточки «Развитие» есть носитель на сайте', () => {
    // Работы по специальности и публикации, НИОКР компаний — в разделе «Кураторы по шести направлениям».
    assert.ok(HTML.includes('>Научные статьи</h3>'), 'на «Экспертам» нет направления «Научные статьи»');
    assert.ok(HTML.includes('научно-технические отчёты по НИОКР для компаний'), 'на «Экспертам» нет НИОКР для компаний');
    assert.ok(HTML.includes('Нужен опыт в том виде работ, который вы готовы вести'), 'на «Экспертам» нет работ по профилю куратора');
    // Методолог — роль команды проекта на «Аспирантам», «Студентам» и «Компаниям».
    for (const page of ['MainPage', 'StudentsPage', 'BusinessPage']) {
      assert.match(read('design', `${page}.dc.html`), />Методолог</u, `${page}: нет роли «Методолог»`);
    }
  });

  it('ответ о договоре и конфиденциальности (#ex-faq-6) прежний', () => {
    assert.ok(HTML.includes("['Что с конфиденциальностью?', 'Куратор подписывает договор поручения обработки персональных данных: до отметки о нём материалы клиентов в кабинете закрыты. Материалы хранятся на серверах в России.'],"));
    const faq = HTML.slice(HTML.indexOf('const faqData = ['), HTML.indexOf('];', HTML.indexOf('const faqData = [')));
    assert.equal([...faq.matchAll(/^\s*\['([^']+)'/gmu)].map((m) => m[1])[6], 'Что с конфиденциальностью?');
  });
});
