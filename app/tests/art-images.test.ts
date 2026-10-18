/**
 * Изображения разделов (Р-622, Р-624, Р-633): каждый адрес `./assets/art/…`
 * в макетах содержательных страниц указывает на файл, который лежит в обеих
 * папках ассетов, — в макетах и в том, что уходит в сеть. Объёмные
 * изображения декоративные: `alt=""` и `aria-hidden`, смысл несёт текст рядом.
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const ROOT = path.join(import.meta.dirname, '..', '..');
const PAGES = ['StartPage', 'MainPage', 'StudentsPage', 'BusinessPage', 'ExpertsPage'];

describe('изображения разделов на месте (Р-622, Р-624, Р-633)', () => {
  for (const page of PAGES) {
    const design = readFileSync(path.join(ROOT, 'design', `${page}.dc.html`), 'utf8');

    it(`${page}: каждый файл из assets/art есть в обеих папках`, () => {
      // Адрес собран в логике макета ('./assets/art/' + icon + '.webp'), поэтому
      // берутся и готовые адреса, и имена объёмных изображений в данных.
      const files = new Set([
        ...[...design.matchAll(/\.\/assets\/art\/([a-z0-9-]+\.webp)/gu)].map((m) => m[1]),
        ...[...design.matchAll(/\b((?:pd|ex)-3d-[a-z]+)\b(?!\.)/gu)].map((m) => `${m[1]}.webp`),
      ]);
      assert.ok(files.size > 0, 'в макете нет изображений разделов');
      for (const file of files) {
        for (const dir of [['design', 'assets', 'art'], ['app', 'public', 'assets', 'art']]) {
          assert.ok(existsSync(path.join(ROOT, ...dir, file)), `нет файла ${dir.join('/')}/${file}`);
        }
      }
    });

    it(`${page}: объёмные изображения декоративные — alt="" и aria-hidden`, () => {
      for (const tag of design.match(/<img src="(?:\.\/assets\/art\/(?:ex|pd)-3d-[a-z]+\.webp|\{\{ [a-z]+\.img \}\})"[^>]*>/gu) ?? []) {
        assert.match(tag, /\balt=""/u, `у изображения нет пустого alt: ${tag.slice(0, 120)}`);
        if (!/width="96"/u.test(tag)) assert.match(tag, /aria-hidden="true"/u, `изображение не скрыто от читалки: ${tag.slice(0, 120)}`);
      }
    });
  }
});
