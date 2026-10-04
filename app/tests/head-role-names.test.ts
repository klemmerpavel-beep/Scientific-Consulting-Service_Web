/**
 * Названия ролей на экранах руководителя (требование РК-01, решение
 * Р-333; В-12, Э-01): «менеджер» — роль `MANAGER`, «куратор» — роль
 * `EXPERT`. Проверяется по снимкам руководителя, по месту вхождений:
 * передача работы — другому менеджеру, реестр «Кураторы», «Вознаграждение
 * куратора»; строка «куратор — ФИО» называет только куратора, а
 * «менеджер — ФИО» — только менеджера или руководителя.
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const HEAD = path.join(import.meta.dirname, '..', '..', 'design', 'cabinet-prototype', 'head');

/** Видимый текст снимка — без разметки и полосы прототипа. */
function text(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/<div class="pt-bar">[\s\S]*?<\/div>/u, '')
    .replace(/<[^>]+>/gu, ' ')
    .replace(/\s+/gu, ' ');
}

const screens = readdirSync(HEAD, { recursive: true })
  .map(String)
  .filter((name) => name.endsWith('.html'))
  .map((name) => ({ name, body: text(path.join(HEAD, name)) }));

// Люди наполнения снимков: менеджер, руководитель и куратор.
const MANAGERS = ['Нечаева', 'Соколов'];
const CURATOR = 'Григорьев';

describe('названия ролей у руководителя (РК-01)', () => {
  it('передача работы — другому менеджеру', () => {
    const cards = screens.filter((screen) => /^projects\/PD-[^/]+\/index\.html$/u.test(screen.name));
    assert.ok(cards.some((screen) => screen.body.includes('Передать работу другому менеджеру')));
  });

  it('реестр «Кураторы» и «Вознаграждение куратора»', () => {
    assert.ok(screens.some((screen) => screen.name.startsWith('manage/registry') && / Кураторы /u.test(screen.body)));
    assert.ok(screens.some((screen) => screen.name.endsWith('payments/index.html') && screen.body.includes('Вознаграждение куратора')));
  });

  it('«куратор — ФИО» называет только куратора, «менеджер — ФИО» — только менеджера', () => {
    for (const screen of screens) {
      for (const name of MANAGERS) {
        assert.ok(!screen.body.includes(`куратор — ${name}`), `${screen.name}: менеджер назван куратором`);
      }
      assert.ok(!screen.body.includes(`менеджер — ${CURATOR}`), `${screen.name}: куратор назван менеджером`);
    }
  });

  it('прежних названий роли нет', () => {
    for (const screen of screens) {
      assert.doesNotMatch(screen.body, /[Ээ]ксперт(?!из)|[Ии]сполнител|Специалист практики/u, screen.name);
    }
  });
});

describe('заголовки экранов руководителя — как пункты меню (РК-14)', () => {
  /** Текст заголовка первого уровня снимка. */
  const h1 = (name: string) => {
    const html = readFileSync(path.join(HEAD, name), 'utf8');
    const match = /<h1[^>]*>([\s\S]*?)<\/h1>/u.exec(html);
    return match === null ? null : match[1]!.replace(/<[^>]+>/gu, '').trim();
  };
  for (const [file, title] of [
    ['manage/index.html', 'Сводка'],
    ['projects/index.html', 'Работы'],
    ['manage/finance/index.html', 'Деньги'],
    ['manage/analytics/index.html', 'Аналитика'],
    ['manage/tools/index.html', 'Управление'],
    ['settings/index.html', 'Настройки'],
  ] as const) {
    it(`${file} — «${title}»`, () => {
      assert.equal(h1(file), title);
    });
  }
});
