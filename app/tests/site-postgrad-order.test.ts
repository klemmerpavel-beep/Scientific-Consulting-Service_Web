/**
 * «Аспирантам» по замечаниям владельца 06.11.2026 (книга замечаний, выгрузка
 * 07.11.2026). Р-823: вторым блоком страницы — компетентность команды:
 * «Кто сопровождает проект» (#team) стоит сразу после первого экрана, раньше
 * «Диагностики» и «Условий». Проверка по макету и по перенесённому
 * компоненту.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const ROOT = path.join(import.meta.dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(path.join(ROOT, ...parts), 'utf8');
const SOURCES: Array<[string, string]> = [
  ['design/MainPage.dc.html', read('design', 'MainPage.dc.html')],
  ['PostgradPage.tsx', read('app', 'src', 'components', 'pages', 'PostgradPage.tsx')],
];

/** Разделы страницы по порядку: id или текст первого h2 раздела. */
const sections = (source: string): string[] =>
  [...source.matchAll(/<section\b([^>]*)>([\s\S]*?)<\/section>/gu)].map((m) => {
    const id = m[1]!.match(/\bid="([a-z-]+)"/u)?.[1];
    if (id) return `#${id}`;
    const h = m[2]!.match(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/u)?.[1] ?? '';
    return h.replace(/<[^>]+>|\{[^}]*\}/gu, '').replace(/\s+/gu, ' ').trim().slice(0, 24);
  });

describe('Р-823: «Кто сопровождает проект» — второй блок «Аспирантам»', () => {
  it('сразу за первым экраном стоит #team, за ним — «Диагностика» и «Условия»', () => {
    for (const [where, source] of SOURCES) {
      const order = sections(source);
      assert.equal(order[1], '#team', `${where}: второй раздел — ${order[1]}`);
      assert.match(order[2] ?? '', /^Сначала/u, `${where}: третий раздел — не «Диагностика»`);
      assert.match(order[3] ?? '', /^Что закреплено/u, `${where}: четвёртый раздел — не «Условия»`);
      assert.equal(order.filter((s) => s === '#team').length, 1, `${where}: раздел #team повторён`);
    }
  });

  it('плитка первого экрана «Проектная команда» ведёт на #team', () => {
    for (const [where, source] of SOURCES) {
      assert.match(source, /href="#team"/u, `${where}: нет перехода к команде с первого экрана`);
    }
  });
});
