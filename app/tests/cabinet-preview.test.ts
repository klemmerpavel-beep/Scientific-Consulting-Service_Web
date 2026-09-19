/**
 * Копия прототипа для боевого сайта не отстаёт от снимка.
 *
 * Прототип показывается по адресу `prodisser.ru/cabinet-preview/` — это
 * статика в `app/public/cabinet-preview`, которую складывает
 * `tools/cabinet-portable.mjs` в конце пересъёмки (решение Р-174).
 * Копия — производное, и её нельзя править руками: расхождение означает,
 * что снимок пересняли, а копию не обновили, и заказчик смотрит прошлый
 * облик кабинета, не зная об этом.
 *
 * Здесь же запирается устройство самой копии. Next отдаёт файлы из `public`
 * по точному пути, поэтому каждая ссылка обязана указывать на файл: одна
 * каталожная ссылка — это один переход в «страницу не найдена».
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const ROOT = path.join(import.meta.dirname, '..', '..');
const PROTOTYPE = path.join(ROOT, 'design', 'cabinet-prototype');
const PREVIEW = path.join(ROOT, 'app', 'public', 'cabinet-preview');
const ARTBOARDS = path.join(ROOT, 'design', 'cabinet');

function files(root: string, ext: string): string[] {
  return readdirSync(root, { recursive: true })
    .map(String)
    .filter((name) => name.endsWith(ext))
    .map((name) => name.split(path.sep).join('/'))
    .sort();
}

describe('копия прототипа для сайта', () => {
  it('собрана', () => {
    assert.ok(
      existsSync(path.join(PREVIEW, 'index.html')),
      'нет app/public/cabinet-preview — пересоберите: node tools/cabinet-portable.mjs app/public/cabinet-preview',
    );
  });

  it('содержит все экраны снимка', () => {
    const snapshot = files(PROTOTYPE, '.html');
    const copy = new Set(files(PREVIEW, '.html'));
    const missing = snapshot.filter((name) => !copy.has(name));
    assert.deepEqual(missing, [], 'копия отстала от снимка');
  });

  it('содержит артборды и общую таблицу стилей', () => {
    assert.ok(existsSync(path.join(PREVIEW, 'prototype.css')), 'нет таблицы стилей');
    const boards = files(ARTBOARDS, '.dc.html').length;
    // Артборды публикуются перечнем, поэтому файлов на один больше.
    assert.equal(files(path.join(PREVIEW, 'artboards'), '.html').length, boards + 1);
  });

  it('каждая ссылка ведёт на файл', () => {
    const broken: string[] = [];
    const directory: string[] = [];

    for (const name of files(PREVIEW, '.html')) {
      const file = path.join(PREVIEW, name);
      const html = readFileSync(file, 'utf8');

      for (const link of html.matchAll(/href="([^"]*)"/gu)) {
        const target = link[1]!;
        // Внешние адреса, якоря и пустая ссылка проверке не подлежат:
        // первых на сайте немного, вторые никуда не ведут.
        if (target === '' || /^(?:[a-z]+:|#|\/\/)/u.test(target)) continue;
        if (target.endsWith('/')) {
          directory.push(`${name} → ${target}`);
          continue;
        }
        const plain = target.split('#')[0]!.split('?')[0]!;
        if (plain === '') continue;
        const full = path.resolve(path.dirname(file), plain);
        if (!existsSync(full)) broken.push(`${name} → ${target}`);
      }
    }

    assert.deepEqual(directory, [], 'каталожная ссылка: сервер такой адрес не развернёт');
    assert.deepEqual(broken, [], 'ссылка ведёт на несуществующий файл');
  });

  it('закрыта от поисковых роботов', () => {
    const open = files(PREVIEW, '.html').filter(
      (name) => !readFileSync(path.join(PREVIEW, name), 'utf8').includes('noindex'),
    );
    assert.deepEqual(open, [], 'экран копии не закрыт мета-тегом');
  });

  it('robots.txt закрывает адрес копии', () => {
    const source = readFileSync(
      path.join(ROOT, 'app', 'src', 'app', 'robots.ts'),
      'utf8',
    );
    assert.ok(source.includes("'/cabinet-preview/'"), 'адрес копии не закрыт в robots.txt');
  });
});
