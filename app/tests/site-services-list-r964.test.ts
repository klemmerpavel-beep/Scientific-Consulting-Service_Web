/**
 * «Аспирантам», «Услуги»: под шестью карточками (сетка Р-941) — одна светлая
 * карточка-ссылка на всю ширину «Полный список услуг — ещё 20 позиций»
 * (исполнение Р-616); пять карточек-ссылок, стоявших под сеткой на виду,
 * ушли в раскрываемый перечень — решение Р-964, ответ владельца 20.11.2026.
 * По нажатию раскрывается прежний перечень из 20 позиций в прежнем порядке.
 * Число в плашке первого экрана — 6 + 20.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const ROOT = path.join(import.meta.dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(path.join(ROOT, ...parts), 'utf8');
const plain = (s: string) => s.replace(/ /gu, ' ');

/** Прежний перечень (до Р-964) — порядок и тексты не меняются. */
const LIST = ['Патентование', 'НИОКР для бизнеса', 'Отчёты по практике и НИР', 'Публикации в рецензируемых журналах', 'Автореферат диссертации',
  'Монографии', 'Перевод статей на английский', 'Разбор отзывов оппонентов и ведущей организации', 'Методика статистической обработки данных',
  'Подбор журнала и подготовка статьи к подаче в индексируемые издания', 'Оформление списка литературы по ГОСТ', 'Доклад и презентация к защите',
  'Научная экспертиза текста', 'Проверка на заимствования и корректная цитируемость', 'Сопровождение иностранных аспирантов',
  'Регистрация программ для ЭВМ и баз данных', 'Экспертиза технической документации', 'Обоснование научной новизны', 'Планирование эксперимента',
  'Апробация на конференциях'];

/** Раздел «Услуги» макета или компонента. */
export function services(source: string): string {
  const at = source.search(/<section (?:className="[^"]*" )?id="services"/u);
  assert.ok(at >= 0, 'нет раздела #services');
  return source.slice(at, source.indexOf('</section>', at));
}

describe('«Аспирантам», «Услуги»: полный список — одной карточкой-ссылкой (Р-964)', () => {
  const html = read('design', 'MainPage.dc.html');
  const tsx = read('app', 'src', 'components', 'pages', 'PostgradPage.tsx');

  it('перечень — 20 позиций в прежнем порядке, все раскрываются вместе; на виду без нажатия ни одной', () => {
    const at = html.indexOf('const offerAll = [');
    const all = [...html.slice(at, html.indexOf('];', at)).matchAll(/'([^']+)'/gu)].map((m) => m[1]);
    assert.deepEqual(all, LIST);
    assert.match(html, /const offerRest = offerAll\.map\(title => \(\{ title \}\)\);/u, 'перечень снова урезан до части позиций');
    const section = services(html);
    const list = section.indexOf('<div id="mp-offer-list">');
    assert.ok(list > 0, 'нет контейнера перечня');
    assert.match(section.slice(list), /^<div id="mp-offer-list">\n<sc-if value="\{\{ offerOpen \}\}"[^>]*>\n<div class="pd-services"[^>]*>\n<sc-for list="\{\{ offerRest \}\}"/u, 'ссылки перечня видны без раскрытия');
    assert.equal((section.match(/list="\{\{ offerRest \}\}"/gu) ?? []).length, 1);
  });

  it('под сеткой — одна светлая карточка-ссылка на всю ширину, перед перечнем; подпись называет число позиций', () => {
    const section = services(html);
    const button = section.match(/<button class="pd-lift" type="button" onClick="\{\{ toggleOffer \}\}" aria-expanded="\{\{ offerOpen \}\}" aria-controls="mp-offer-list" style="([^"]*)"/u);
    assert.ok(button, 'нет кнопки раскрытия с aria-controls');
    for (const prop of ['width:100%', 'background:var(--pd-ink-inverse)', 'border:1px solid var(--pd-border)', 'border-radius:14px']) {
      assert.ok(button[1]!.includes(prop), `у карточки-ссылки нет ${prop} (исполнение Р-616)`);
    }
    assert.ok(section.indexOf('aria-controls="mp-offer-list"') < section.indexOf('<div id="mp-offer-list">'), 'кнопка стоит после перечня');
    assert.equal((section.match(/<button\b/gu) ?? []).length, 1, 'под сеткой больше одной кнопки');
    assert.equal(plain(html).split("offerToggleLabel: offerOpen ? 'Свернуть список' : 'Полный список услуг — ещё ' + offerAll.length + ' позиций',").length, 2);
    assert.equal(LIST.length, 20, 'подпись «ещё 20 позиций» рассчитана на 20');
  });

  it('число плашки первого экрана — шесть карточек и полный список', () => {
    const count = (name: string) => {
      const at = html.indexOf(`const ${name} = [`);
      return (html.slice(at, html.indexOf('].map', at)).match(/^\s*\[/gmu) ?? []).length;
    };
    const plate = Number(html.match(/>(\d+) позиций<\/span>/u)?.[1]);
    assert.equal(plate, count('offerTop') + count('offerMid') + LIST.length);
    assert.equal(plate, 26);
  });

  it('компонент: перечень под условием раскрытия, кнопка с aria-controls', () => {
    const section = services(tsx);
    assert.match(section, /aria-controls="mp-offer-list"/u);
    assert.match(section, /<div id="mp-offer-list">\{offerOpen \? \(/u);
  });
});
