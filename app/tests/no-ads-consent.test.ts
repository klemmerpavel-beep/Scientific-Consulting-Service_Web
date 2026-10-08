/**
 * Отметки о рекламных сообщениях на сайте нет (решение Р-495).
 *
 * Владелец снял отметку «Согласен получать информационные и рекламные
 * сообщения» во всех формах и в тексте согласия. Новая редакция согласия —
 * 1.1 от 08.10.2026, и её дата совпадает с версией, которая пишется в
 * заявку: по ней видно, с каким текстом согласился заявитель.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { CONSENT_VERSION } from '../src/lib/lead-schema.ts';

const ROOT = path.join(import.meta.dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(path.join(ROOT, ...parts), 'utf8');

const PAGES: readonly [string, string][] = [
  ['StartPage', 'StartPage'],
  ['MainPage', 'PostgradPage'],
  ['StudentsPage', 'StudentsPage'],
  ['BusinessPage', 'BusinessPage'],
  ['ConsentPage', 'ConsentPage'],
];

describe('отметки о рекламных сообщениях нет (Р-495)', () => {
  for (const [design, component] of PAGES) {
    it(`${design}: ни фразы, ни поля`, () => {
      for (const text of [read('design', `${design}.dc.html`), read('app', 'src', 'components', 'pages', `${component}.tsx`)]) {
        assert.doesNotMatch(text, /Согласен получать информационные и рекламные сообщения/u);
        assert.doesNotMatch(text, /name="marketing"/u);
      }
    });
  }

  it('в согласии нет раздела о рекламе, редакция 1.1 — с той же датой, что версия в заявке', () => {
    const consent = read('design', 'ConsentPage.dc.html');
    assert.doesNotMatch(consent, /id="ads"|рекламн/u);
    assert.match(consent, />9\.<\/span><span>Дата редакции и версия</u);
    assert.match(consent, /Редакция от 8 октября 2026 года, версия 1\.1\./u);
    assert.equal(CONSENT_VERSION, '2026-10-08');
  });

  it('согласие на обработку и акцепт оферты в формах на месте', () => {
    for (const [design] of PAGES.slice(0, 4)) {
      const page = read('design', `${design}.dc.html`);
      assert.match(page, /name="consent" type="checkbox" required/u, `${design}: нет согласия на обработку`);
      assert.match(page, /name="terms" type="checkbox" required/u, `${design}: нет акцепта оферты`);
    }
  });
});
