/**
 * «Студентам»: фоновая сборка работы (Р-850). В правом поле три листа по
 * мере прокрутки сходятся в стопку, в конце страницы на них закрывается
 * обложка «ВКР». Слой декоративный (aria-hidden, без событий указателя, под
 * разделами); движение — только transform и opacity; слой показан только
 * там, где правое поле шире листа, браузер умеет привязку к прокрутке и
 * движение не уменьшено (Р-43, Р-93, Р-620).
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const ROOT = path.join(import.meta.dirname, '..', '..');
const HTML = readFileSync(path.join(ROOT, 'design', 'StudentsPage.dc.html'), 'utf8');
const CSS = HTML.slice(HTML.indexOf('<style'), HTML.indexOf('</style>'));

describe('«Студентам»: фоновая сборка ВКР (Р-850)', () => {
  it('слой декоративный: aria-hidden, три листа и обложка «ВКР», изображения в обеих папках ассетов', () => {
    const at = HTML.indexOf('<div class="sp-build" aria-hidden="true">');
    assert.ok(at > 0, 'нет слоя сборки с aria-hidden');
    const layer = HTML.slice(at, HTML.indexOf('\n</div>', at));
    const images = [...layer.matchAll(/<img (?:class="[^"]+" )?src="\.\/assets\/art\/([a-z0-9-]+\.webp)" alt=""/gu)].map((m) => m[1]!);
    assert.deepEqual(images, ['st-sheet-1.webp', 'st-sheet-2.webp', 'st-sheet-3.webp', 'st-cover.webp']);
    for (const file of images) {
      const [a, b] = ['design/assets/art', 'app/public/assets/art'].map((dir) => readFileSync(path.join(ROOT, dir, file)));
      assert.ok(a!.equals(b!), `${file} в папках ассетов различается`);
    }
    assert.match(layer, />ВКР<\/span>/u);
    assert.ok(HTML.indexOf('<div class="sp-build"') < HTML.indexOf('<main id="main">'), 'слой — до содержания, под разделами');
  });

  it('движение — только transform и opacity, привязано к прокрутке страницы', () => {
    const frames = [...CSS.matchAll(/@keyframes (sp-build-[a-z0-9]+)\{([\s\S]*?\})\}/gu)];
    assert.deepEqual(frames.map((m) => m[1]), ['sp-build-s1', 'sp-build-s2', 'sp-build-s3', 'sp-build-cover']);
    for (const [, name, body] of frames) {
      const props = new Set([...body!.matchAll(/([a-z-]+):/gu)].map((m) => m[1]));
      assert.deepEqual([...props].sort(), ['opacity', 'transform'], `${name}: ${[...props].join(', ')}`);
    }
    assert.match(CSS, /animation-timeline:scroll\(root block\)/u);
  });

  it('по умолчанию слоя нет; он включается от 1400 px, без уменьшенного движения и при поддержке привязки к прокрутке', () => {
    assert.match(CSS, /\.sp-build\{display:none\}/u);
    const gate = CSS.indexOf('@media (min-width:1400px) and (prefers-reduced-motion:no-preference){@supports (animation-timeline:scroll()){');
    assert.ok(gate > 0, 'нет условия показа слоя');
    const on = CSS.indexOf('.sp-build{display:block');
    assert.ok(on > gate && on < CSS.indexOf('}}', gate), 'слой включается вне условия');
    assert.match(CSS.slice(on), /^\.sp-build\{display:block;position:fixed;[^}]*z-index:0;pointer-events:none\}/u);
  });

  it('правое поле свободно: справа ниже первого экрана колец фона нет', () => {
    assert.doesNotMatch(HTML, /<svg class="pd-orb pd-orb-b"[^>]*left:calc\(50% \+ 238px\)/u);
  });
});
