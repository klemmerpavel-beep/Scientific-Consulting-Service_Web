/**
 * Сайт (Р-810, замечание владельца З-2 от 05.11.2026): раздел «Что
 * закреплено в договоре» на «Аспирантам» — каждая карточка в три строки
 * «что вы получаете → как проверить до подписания → где это видно
 * (Задание, кабинет, акт)» прежними формулировками и объёмное изображение
 * владельца 96 px. Решение владельца 05.11.2026 дополняет Р-633: на
 * «Аспирантам» объёмные изображения получают два блока — «Шесть шагов» и
 * этот, изображения в них не повторяются, третьего блока нет. Проверка по
 * макету и по перенесённому компоненту.
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { findForbidden } from '../src/lib/cabinet/text-guard.ts';

const ROOT = path.join(import.meta.dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(path.join(ROOT, ...parts), 'utf8');
const MAIN = read('design', 'MainPage.dc.html');
const TSX = read('app', 'src', 'components', 'pages', 'PostgradPage.tsx');
const NB = / /gu;
const plain = (s: string) => s.replace(NB, ' ');

/** Раздел «Условия»: от `<section` перед меткой до его `</section>`. */
const SECTION = (() => {
  const at = MAIN.indexOf('>Условия</span>');
  assert.ok(at > 0, 'нет раздела «Условия»');
  return MAIN.slice(MAIN.lastIndexOf('<section', at), MAIN.indexOf('</section>', at));
})();
/** Строки массива `const usp = [ … ].map` — кортежами строк. */
const CARDS = (() => {
  const at = MAIN.indexOf('const usp = [');
  assert.ok(at > 0, 'нет данных usp');
  const body = MAIN.slice(at, MAIN.indexOf('].map', at));
  return [...body.matchAll(/^\s*\[('[^\n]*')\],?$/gmu)].map((m) => [...m[1]!.matchAll(/'([^']*)'/gu)].map((s) => plain(s[1]!)));
})();
const ART = Object.fromEntries([...(MAIN.match(/const uspArt = \{([^}]*)\}/u)?.[1] ?? '').matchAll(/'([a-z-]+)': '([a-z0-9-]+)'/gu)].map((m) => [m[1]!, m[2]!]));
const STEP_IMG = [...(MAIN.match(/const stepImg = \[([^\]]*)\]/u)?.[1] ?? '').matchAll(/'([a-z0-9-]+)'/gu)].map((m) => m[1]!);

describe('Р-810: «Что закреплено в договоре» на «Аспирантам»', () => {
  it('четыре карточки прежними заголовками; объёмные изображения — по понятию карточки', () => {
    assert.deepEqual(CARDS.map((c) => c[1]), [
      'Куратор со степенью по вашей специальности',
      'Нормоконтроль по ГОСТ и требованиям ВАК',
      'Языковая и терминологическая поддержка',
      'Этапы с актом приёмки',
    ]);
    assert.deepEqual(CARDS.map((c) => ART[c[0]!]), ['pd-3d-degree', 'pd-3d-sheets', 'pd-3d-laptop', 'pd-3d-stairs']);
    for (const name of Object.values(ART)) {
      for (const dir of [['design', 'assets', 'art'], ['app', 'public', 'assets', 'art']]) {
        assert.ok(existsSync(path.join(ROOT, ...dir, `${name}.webp`)), `нет файла ${dir.join('/')}/${name}.webp`);
      }
    }
  });

  it('изображения не повторяют «Шесть шагов» и друг друга (одно понятие — одно изображение, Р-633)', () => {
    assert.equal(STEP_IMG.length, 6, 'нет изображений «Шести шагов»');
    const mine = Object.values(ART);
    assert.equal(new Set(mine).size, mine.length, 'изображение повторяется в карточках');
    for (const name of mine) assert.ok(!STEP_IMG.includes(name), `${name} уже стоит в «Шести шагах»`);
  });

  it('на «Аспирантам» объёмные изображения — ровно в двух блоках: «Шесть шагов» и «Условия»', () => {
    const tags = MAIN.match(/<img\b[^>]*>/gu) ?? [];
    const art = tags.filter((t) => /src="(?:\.\/assets\/art\/(?:pd|ex)-3d-|\{\{ [a-z]+\.img \}\})/u.test(t));
    assert.deepEqual(art.map((t) => t.match(/src="([^"]+)"/u)![1]), ['{{ u.img }}', '{{ p.img }}'], 'объёмные изображения появились в третьем блоке');
    const named = MAIN.split('\n').filter((l) => /\b(?:pd|ex)-3d-[a-z]+/u.test(l) && !/^\s*\/\//u.test(l));
    assert.deepEqual(named.map((l) => l.trim().slice(0, 14)).sort(), ['const stepImg ', 'const uspArt ='], 'имя объёмного изображения вне двух блоков');
  });

  it('изображение 96 px, декоративное: смысл несёт заголовок карточки', () => {
    const img = SECTION.match(/<img class="pd-term-img"[^>]*>/u)?.[0] ?? '';
    assert.match(img, /src="\{\{ u\.img \}\}"/u);
    assert.match(img, /\balt=""/u);
    assert.match(img, /aria-hidden="true"/u);
    assert.match(img, /width="96" height="96"/u);
    assert.match(img, /width:96px;height:96px/u);
  });

  it('в карточке три строки: что вы получаете → как проверить до подписания → где это видно', () => {
    const labels = [...SECTION.matchAll(/<div class="pd-term-row"[^>]*>\s*<span[^>]*>([^<]+)<\/span>/gu)].map((m) => m[1]);
    assert.deepEqual(labels, ['Что вы получаете', 'Как проверить до подписания', 'Где это видно']);
    for (const field of ['u.text', 'u.check', 'u.place', 'u.where']) assert.ok(SECTION.includes(`{{ ${field} }}`), `строка без ${field}`);
    for (const card of CARDS) {
      assert.equal(card.length, 6, `у карточки «${card[1]}» не шесть полей`);
      assert.ok(['Задание', 'Кабинет', 'Акт'].includes(card[4]!), `«где это видно» — не Задание, кабинет или акт: ${card[4]}`);
    }
    assert.deepEqual(new Set(CARDS.map((c) => c[4])), new Set(['Задание', 'Кабинет', 'Акт']), 'видно не во всех трёх местах');
  });

  it('тексты — прежние формулировки карточек и страницы, без новых обещаний', () => {
    assert.deepEqual(CARDS.map((c) => c.slice(2)), [
      ['Специалист с учёной степенью в вашей области разбирает методологию, показывает слабые места аргументации и готовит к вопросам оппонентов.', 'Профиль куратора вы видите до согласования Задания', 'Кабинет', 'профиль куратора'],
      ['Структура, оформление, библиография и ссылочный аппарат проверяются по ГОСТ Р 7.0.11-2011 и требованиям вашего диссовета.', 'Перечень «Что подготовить» по виду работы — в кабинете до начала работы', 'Задание', 'требования к результату'],
      ['Научная экспертиза текста на русском, перевод для англоязычных журналов, сопровождение иностранных аспирантов вплоть до выступления на защите.', 'Состав работ — в Задании, вы согласуете его в кабинете', 'Кабинет', 'версии текста и замечания к ним'],
      ['По каждому этапу — отчёт и акт с комментариями куратора.', 'Задание фиксирует объём, сроки и стоимость по этапам', 'Акт', 'приложен к платежу в кабинете'],
    ]);
    // Носители строк «где это видно» — на этой же странице и в оферте.
    const page = plain(MAIN);
    for (const source of ['его профиль', 'Замечание оставляется к конкретной версии', 'Счета и акты приложены к платежам']) assert.ok(page.includes(source), `нет носителя «${source}»`);
    assert.ok(plain(read('design', 'OfferPage.dc.html')).includes('определяющий состав работ, требования к результату'), 'в оферте нет «требования к результату»');
    const all = CARDS.map((c) => c.slice(1).join(' ')).join('\n');
    assert.deepEqual(findForbidden(all, 'Условия'), []);
    assert.doesNotMatch(all, /под ключ|гаранти|!|напишем|за вас/iu);
  });

  it('строки соседних карточек — на общих линиях (подсетка); перенос в компонент', () => {
    for (const [where, source] of [['макет', MAIN], ['компонент', TSX]] as const) {
      assert.ok(source.includes('.pd-term{display:grid;grid-row:span 4;grid-template-rows:subgrid;row-gap:0;grid-template-columns:96px minmax(0,1fr);column-gap:20px;min-width:0}'), `${where}: нет подсетки карточки`);
    }
    assert.match(TSX, /const uspArt = \{ 'pd-degree': 'pd-3d-degree', 'pd-gost': 'pd-3d-sheets', 'pd-editing': 'pd-3d-laptop', 'pd-stages': 'pd-3d-stairs' \};/u);
    assert.ok(plain(TSX).includes('Как проверить до подписания'));
  });
});
