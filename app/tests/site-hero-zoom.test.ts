/**
 * Портреты ролей первого экрана под курсором крупнее (Р-947). Замечание
 * владельца с кнопки 08.11.2026: «сделать так, чтобы картинки на hero блоке
 * увеличивались при наведении на 25—30 %». Отклик на действие в пределах
 * Р-43: только transform, 220 мс, на сенсорных экранах и при уменьшенном
 * движении портрет стоит на месте; рост идёт от нижней точки круга, чтобы
 * подпись роли под портретом не закрывалась.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const ROOT = path.join(import.meta.dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(path.join(ROOT, ...parts), 'utf8');

/** Масштаб правила наведения `.pd-zoom:hover` — число из `scale(…)`. */
export function zoomScale(css: string): number {
  const rule = /@media \(hover:hover\)\{\.pd-zoom:hover\{transform:scale\(([\d.]+)\)/u.exec(css);
  return rule ? Number(rule[1]) : Number.NaN;
}

describe('портреты первого экрана увеличиваются при наведении (Р-947)', () => {
  const design = read('design', 'StartPage.dc.html');

  it('посадочная: оба портрета ролей несут класс pd-zoom', () => {
    const hero = design.slice(design.indexOf('class="pd-hero-art"'), design.indexOf('class="pd-metrics"'));
    const circles = hero.match(/<span class="pd-zoom" style="width:\d+px;height:\d+px;border-radius:50%/gu) ?? [];
    assert.equal(circles.length, 2, 'портретов с увеличением должно быть два: куратор и менеджер');
  });

  it('увеличение — на 25—30 %, только при настоящем наведении, от нижней точки круга', () => {
    const scale = zoomScale(design);
    assert.ok(scale >= 1.25 && scale <= 1.3, `масштаб ${scale} вне 1,25—1,30`);
    assert.match(design, /\.pd-zoom\{position:relative;transform-origin:50% 100%;transition:transform 220ms cubic-bezier\(\.2,0,\.2,1\)/u);
    assert.match(design, /@media \(prefers-reduced-motion:reduce\)\{\.pd-zoom:hover\{transform:none!important/u);
    assert.ok(read('app', 'src', 'components', 'pages', 'StartPage.tsx').includes('.pd-zoom:hover{transform:scale(1.28)'), 'правило не перенесено в компонент');
  });

  it('проба: правило без условия наведения не считается', () => {
    assert.ok(Number.isNaN(zoomScale('.pd-zoom:hover{transform:scale(1.28)}')));
  });
});
