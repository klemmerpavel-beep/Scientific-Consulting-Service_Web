/**
 * «Работы»: вид работы — шапкой карточки по центру (замечание владельца
 * 28.10.2026, решение Р-831). У каждой плашки вид сопровождения
 * («Сопровождение диссертационного исследования» и другие) стоит на одном
 * месте — вверху по центру, отделённый линией. Когда название работы
 * совпадает с видом, шапка и есть заголовок-ссылка; когда у работы своё
 * название, оно — заголовком под шапкой.
 *
 * Проверка ходит по исходнику, как `cabinet-markup.test.ts`.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const page = readFileSync(path.join(import.meta.dirname, '..', 'src', 'app', 'cabinet', 'projects', 'page.tsx'), 'utf8');
const card = page.slice(page.indexOf('<div data-work-type=""'), page.indexOf('project.topic === null'));

describe('Р-831: вид работы вверху карточки по центру', () => {
  it('шапка по центру, отделена линией, стоит первой в карточке', () => {
    assert.match(card, /^<div data-work-type="" style=\{\{ textAlign: 'center', padding: '0 0 10px', margin: '0 0 10px', borderBottom: '1px solid var\(--pd-divider\)' \}\}>/u);
    const plate = page.slice(page.lastIndexOf('<Card', page.indexOf('<div data-work-type=""')), page.indexOf('<div data-work-type=""'));
    assert.doesNotMatch(plate.replace(/\{\/\*[\s\S]*?\*\/\}/gu, ''), /<(?:Chip|Heading|Text|div)\b/u, 'над шапкой вида стоит что-то ещё');
  });

  it('совпадает с названием — шапка и есть заголовок-ссылка; своё название — вид абзацем, заголовок ниже', () => {
    assert.match(card, /\{project\.title === project\.serviceType\.name \? \(\s*<Heading level=\{2\} size=\{3\}>\s*<a href=\{`\/cabinet\/projects\/\$\{project\.code\}`\} className="cab-stretch"/u);
    assert.match(card, /\) : \(\s*<p style=\{WORK_TYPE_HEAD\}>\{project\.serviceType\.name\}<\/p>\s*\)\}/u);
    assert.match(card, /\{project\.title === project\.serviceType\.name \? null : \(\s*<Heading level=\{2\} size=\{3\} style=\{\{ marginBottom: 4 \}\}>/u);
    // Заголовок-ссылка в карточке ровно один при любом названии.
    assert.equal((card.match(/className="cab-stretch"/gu) ?? []).length, 2, 'ссылок-заголовков не две ветки');
  });

  it('прежнего чипа вида слева вверху нет', () => {
    assert.doesNotMatch(page, /<Chip tone="accent">\{project\.serviceType\.name\}<\/Chip>/u);
  });
});
