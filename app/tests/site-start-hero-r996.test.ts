/**
 * Посадочная, первый экран по варианту А (Р-996; макет утверждён владельцем
 * 22.11.2026, С-8.1; образец — первый экран «Студентам», Р-852, Р-855).
 *
 * - Над h1 — плашка-доказательство «Научный коллектив с 2016 года» с тремя
 *   портретами ролей 32 px: тот же компонент и те же файлы, что на
 *   «Студентам»; без имён (Р-53).
 * - Справа над портретами — метка «Кто сопровождает работу»; портреты и
 *   подписи прежние; три плашки с числами — строками одна под другой
 *   (число слева, пояснение и ссылка справа), числа и ссылки прежние.
 * - h1 прежний (совпадает с `<title>`, Р-769), мера 24ch, подсветка по
 *   DESIGN-SYSTEM §3.4; от 1101 px колонки 1.12fr / .88fr — так кнопка формы
 *   остаётся в первом окне 1440 × 900 вместе с плашкой.
 * Проверка — по макету и перенесённому компоненту.
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const ROOT = path.join(import.meta.dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(path.join(ROOT, ...parts), 'utf8');
const plain = (s: string) => s.replace(/<!--[\s\S]*?-->/gu, '').replace(/<[^>]+>/gu, '').replace(/\s+/gu, ' ').trim();

export const HERO_RULES = [
  '.pd-metrics{display:grid;grid-template-columns:minmax(0,1fr)}',
  '@media (min-width:1101px){.pd-hero{grid-template-columns:minmax(0,1.12fr) minmax(0,.88fr)}}',
  '@media (max-width:480px){.pd-metrics>a{grid-template-columns:minmax(0,1fr)!important}.pd-metrics>a>span:first-child{grid-row:auto!important}}',
  '@media (max-width:400px){.pd-proof{gap:10px!important;padding-right:12px!important}.pd-proof>span:last-child{font-size:13px!important}}',
];

/** Первый раздел `<main>` макета. */
export function heroOf(html: string): string {
  const at = html.indexOf('<section', html.indexOf('<main'));
  assert.ok(at >= 0, 'нет первого раздела');
  return html.slice(at, html.indexOf('</section>', at));
}

describe('посадочная: первый экран по варианту А (Р-996)', () => {
  const html = read('design', 'StartPage.dc.html');
  const tsx = read('app', 'src', 'components', 'pages', 'StartPage.tsx');

  it('правила раскладки стоят в макете и в компоненте; плашки нигде не встают в две-три колонки', () => {
    for (const rule of HERO_RULES) {
      assert.ok(html.includes(rule), `в макете нет правила: ${rule}`);
      assert.ok(tsx.includes(rule), `в компоненте нет правила: ${rule}`);
    }
    assert.doesNotMatch(html, /\.pd-metrics\{[^}]*grid-template-columns:repeat\(/u, 'плашки снова колонками');
    assert.doesNotMatch(html, /\.pd-metrics,\.pd-routes\{grid-template-columns:repeat\(2/u, 'плашки снова в две колонки до 768 px');
  });

  it('над h1 — плашка «Научный коллектив с 2016 года» с портретами ролей «Студентам»', () => {
    const hero = heroOf(html);
    const at = hero.indexOf('<span class="pd-proof"');
    assert.ok(at > 0, 'нет плашки');
    const plate = hero.slice(at, hero.indexOf('<h1', at));
    assert.equal(plain(plate), 'Научный коллектив с 2016 года');
    const faces = [...plate.matchAll(/<img src="\.\/assets\/avatars\/(ph-[a-z]+)\.webp" alt="" aria-hidden="true" width="32" height="32"/gu)].map((m) => m[1]);
    assert.deepEqual(faces, ['ph-curator', 'ph-expert', 'ph-editor']);
    for (const face of faces) {
      assert.ok(existsSync(path.join(ROOT, 'design', 'assets', 'avatars', `${face}.webp`)), `${face}: нет в design/assets`);
      assert.ok(existsSync(path.join(ROOT, 'app', 'public', 'assets', 'avatars', `${face}.webp`)), `${face}: нет в app/public/assets`);
    }
    assert.match(plate, /^<span class="pd-proof" style="display:inline-flex;align-items:center;gap:12px;[^"]*margin-bottom:24px;padding:6px 16px 6px 8px;border:1px solid var\(--pd-border\);border-radius:999px;/u);
    assert.ok(plate.endsWith('</span>\n'), 'между плашкой и h1 другой элемент');
    const student = read('design', 'StudentsPage.dc.html');
    const ref = student.slice(student.indexOf('<span class="sp-proof"'), student.indexOf('<h1', student.indexOf('<span class="sp-proof"')));
    assert.equal(plate.replace('pd-proof', 'sp-proof').trim(), ref.trim(), 'плашка расходится с плашкой «Студентам» (Р-855)');
  });

  it('h1 прежний, мера 24ch, подсветка по §3.4; поля первого экрана — 32 и 20 px', () => {
    const hero = heroOf(html);
    const h1 = /<h1 style="([^"]*)">([\s\S]*?)<\/h1>/u.exec(hero);
    assert.ok(h1);
    assert.equal(plain(h1[2]), 'ProDisser — научный консалтинг для студентов, аспирантов, молодых учёных и компаний');
    assert.match(h1[1], /max-width:24ch/u);
    assert.match(h1[2], /<span style="background:var\(--pd-accent-mark\);border-radius:6px;padding:2px 0;box-shadow:-\.1em 0 0 var\(--pd-accent-mark\),\.1em 0 0 var\(--pd-accent-mark\);mix-blend-mode:multiply;/u);
    assert.doesNotMatch(h1[2], /margin-left:-10px/u);
    assert.match(hero, /^<section class="pd-pad" style="max-width:1220px;margin:0 auto;padding:32px 30px 0;/u);
    assert.match(hero, /<p style="margin:20px 0 0;font-size:16px;line-height:1\.6;color:var\(--pd-ink-secondary\);max-width:52ch">\{\{ lead \}\}<\/p>/u);
  });

  it('справа: метка «Кто сопровождает работу», прежние портреты, три плашки строками с прежними числами и ссылками', () => {
    const hero = heroOf(html);
    const art = hero.slice(hero.indexOf('<div class="pd-hero-art"'));
    const body = art.replace(/<!--[\s\S]*?-->\n?/gu, '');
    assert.match(body, /^<div class="pd-hero-art" style="[^"]*">\n<span style="margin-top:auto;font-family:'Inter','Helvetica Neue',Arial,sans-serif;font-size:12px;line-height:1\.4;letter-spacing:\.06em;text-transform:uppercase;color:var\(--pd-ink-muted\)">Кто сопровождает работу<\/span>/u);
    assert.ok(art.indexOf('Кто сопровождает работу</span>') < art.indexOf('class="pd-roles"'), 'метка не над портретами');
    for (const slot of ['sp-avatar-1', 'sp-avatar-2c']) assert.ok(art.includes(`<image-slot id="${slot}"`), `нет портрета ${slot}`);
    assert.ok(art.includes('Куратор проекта — кандидат наук вашего направления'));
    assert.ok(art.includes('Менеджер проекта — сроки, документы, оплаты'));
    const plates = [...art.matchAll(/<a class="pd-lift" href="([^"]+)" style="([^"]*)"[^>]*>\n<span style="([^"]*)">([^<]+)<\/span>/gu)].map((m) => [m[1], m[2], m[3], m[4]]);
    assert.deepEqual(plates.map(([href, , , num]) => [href, num]), [['./business.html#catalog', '52 позиции'], ['./main.html#process', '6 шагов'], ['./main.html#team', 'с\u00a02016']]); // Р-1005: «с» не отрывается от года
    for (const [href, style, num] of plates) {
      assert.match(style, /^display:grid;grid-template-columns:132px minmax\(0,1fr\);align-items:center;column-gap:16px;row-gap:6px;/u, `${href}: плашка не строкой`);
      assert.match(num, /^grid-row:1 \/ span 2;/u, `${href}: число не слева на две строки`);
    }
  });

  it('проба: прежний первый экран не проходит', () => {
    const old = '<main><section class="pd-pad" style="max-width:1220px;margin:0 auto;padding:56px 30px 0"><h1 style="max-width:20ch">x</h1><div class="pd-hero-art" style="gap:24px"><div class="pd-roles"></div></div></section></main>';
    const hero = heroOf(old);
    assert.equal(hero.indexOf('<span class="pd-proof"'), -1);
    assert.doesNotMatch(hero, /Кто сопровождает работу/u);
  });
});
