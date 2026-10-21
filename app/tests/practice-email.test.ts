/**
 * Адрес практики — один на сайте, в правовых текстах и в кабинете
 * (подготовка Т-01б, решение Р-638).
 *
 * Кабинет, письма и разметка организации берут адрес из
 * `lib/practice-contacts.ts`. Страницы сайта, оферта, Политика, Согласие,
 * `LICENSE` и `SECURITY.md` пишут его в тексте. При переходе на ящик домена
 * адрес меняется во всех этих местах одним выпуском вместе с новой
 * редакцией правовых текстов: частичная замена дала бы человеку, который
 * отзывает согласие, два адреса. Проверка падает на любом месте, где адрес
 * практики расходится с константой, — и на прежнем адресе, и на новом.
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { PRACTICE_EMAIL } from '../src/lib/practice-contacts.ts';

const APP = path.join(import.meta.dirname, '..');
const ROOT = path.join(APP, '..');
const SRC = path.join(APP, 'src');

function read(...parts: string[]): string {
  return readFileSync(path.join(...parts), 'utf8');
}

/** Оба адреса практики: действующий на gmail и будущий на домене. */
const PRACTICE_ADDRESS = /\binfo(?:\.prodisser)?@(?:gmail\.com|prodisser\.ru)\b/gu;

const PAGES = [
  { design: 'StartPage', code: 'StartPage' },
  { design: 'MainPage', code: 'PostgradPage' },
  { design: 'StudentsPage', code: 'StudentsPage' },
  { design: 'BusinessPage', code: 'BusinessPage' },
  { design: 'ExpertsPage', code: 'ExpertsPage' },
  { design: 'NotFoundPage', code: 'NotFoundPage' },
  { design: 'OfferPage', code: 'OfferPage' },
  { design: 'PrivacyPage', code: 'PrivacyPage' },
  { design: 'ConsentPage', code: 'ConsentPage' },
];

function addresses(text: string): string[] {
  return [...text.matchAll(PRACTICE_ADDRESS)].map((match) => match[0]);
}

function assertSame(label: string, text: string): void {
  const found = addresses(text);
  assert.ok(found.length > 0, `${label}: адрес практики не назван`);
  for (const address of found) {
    assert.equal(address, PRACTICE_EMAIL, `${label}: ${address} вместо ${PRACTICE_EMAIL}`);
  }
}

describe('адрес практики совпадает с константой', () => {
  for (const page of PAGES) {
    it(`${page.design}: макет и перенесённый код`, () => {
      assertSame(`design/${page.design}.dc.html`, read(ROOT, 'design', `${page.design}.dc.html`));
      assertSame(`components/pages/${page.code}.tsx`, read(SRC, 'components', 'pages', `${page.code}.tsx`));
    });
  }

  it('LICENSE и SECURITY.md', () => {
    assertSame('LICENSE', read(ROOT, 'LICENSE'));
    assertSame('SECURITY.md', read(ROOT, 'SECURITY.md'));
  });
});

describe('код приложения берёт адрес из константы', () => {
  const pages = path.join(SRC, 'components', 'pages');
  const own = path.join(SRC, 'lib', 'practice-contacts.ts');

  function sources(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return full === pages || entry.name === 'generated' ? [] : sources(full);
      return /\.tsx?$/u.test(entry.name) && full !== own ? [full] : [];
    });
  }

  it('ни один файл, кроме константы и перенесённых макетов, не пишет адрес строкой', () => {
    const literal = sources(SRC).filter((file) => addresses(readFileSync(file, 'utf8')).length > 0);
    assert.deepEqual(literal.map((file) => path.relative(SRC, file)), []);
  });
});
