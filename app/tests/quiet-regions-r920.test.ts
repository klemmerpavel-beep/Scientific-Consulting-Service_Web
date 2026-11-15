/**
 * Остановки Tab — только на действиях; живая область — только у исхода
 * действия (решение Р-920).
 *
 * Аудит 15.11.2026, находка Д-4: тело каждой свёртки было областью с
 * `tabindex="0"` — 2–4 лишних нажатия Tab на экран; около 25 постоянных
 * плашек состояния были помечены `role="status"`, и читалка объявляла их
 * как событие при каждой перерисовке.
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const SRC = path.join(import.meta.dirname, '..', 'src');
const ui = readFileSync(path.join(SRC, 'components', 'cabinet', 'ui.tsx'), 'utf8');
const screens = ['app/cabinet', 'components/cabinet'].flatMap((dir) =>
  readdirSync(path.join(SRC, dir), { recursive: true })
    .map(String)
    .filter((name) => name.endsWith('.tsx'))
    .map((name) => ({ name: path.join(dir, name).split(path.sep).join('/'), body: readFileSync(path.join(SRC, dir, name), 'utf8') })),
);

describe('свёртка — область только когда прокручивается (Р-920)', () => {
  it('остановку Tab и имя области несёт только «высокая» свёртка — история работы', () => {
    assert.match(ui, /\{\.\.\.\(tall \? \{ role: 'region', 'aria-label': title, tabIndex: 0 \} : \{\}\)\}/u);
    const fold = ui.slice(ui.indexOf("className={tall ? 'cab-fold-body cab-fold-tall' : 'cab-fold-body'}"));
    assert.doesNotMatch(fold.slice(0, 600), /\n\s+tabIndex=\{0\}/u);
  });
});

describe('живая область — у исхода действия (Р-920)', () => {
  it('спокойная плашка роли по умолчанию не несёт; зелёная и красная — `status`', () => {
    assert.match(ui, /role=\{role \?\? \(tone === 'quiet' \? undefined : 'status'\)\}/u);
    assert.doesNotMatch(ui, /\n  role = 'status',\n/u);
  });

  it('явный `status` у спокойной плашки — только у исхода действия', () => {
    const marked = screens.flatMap(({ name, body }) =>
      [...body.matchAll(/<Notice tone="quiet" role="status">([\s\S]{0,260})/gu)].map((match) => ({ name, next: match[1]! })),
    );
    assert.ok(marked.length <= 4, `плашек ${marked.length}`);
    for (const { name, next } of marked) {
      assert.match(next, /Документ не найден|В документе несколько вариантов темы/u, name);
    }
  });

  it('исход действия живой областью остаётся', () => {
    assert.match(ui, /<Notice tone=\{tone\} role=\{tone === 'error' \? 'alert' : 'status'\}>/u);
  });
});
