/**
 * Реквизиты общества — только на правовых страницах (решение Р-278).
 *
 * Наименование, ОГРН, ИНН, КПП и адрес общества выводятся в оферте,
 * политике и согласии. На главной, на страницах аспирантам, студентам и
 * компаниям и на странице «не найдено» их нет ни в подвале, ни в разметке
 * для поисковиков, ни в метаданных. Проверка идёт и по макетам, и по
 * перенесённому коду: макет — источник правды, код — то, что уходит в сеть.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const APP = path.join(import.meta.dirname, '..');
const ROOT = path.join(APP, '..');
const SRC = path.join(APP, 'src');

function read(...parts: string[]): string {
  return readFileSync(path.join(...parts), 'utf8');
}

const REQUISITES = /1257700248860|9723254250|772301001|ОГРН|КПП|Перервинский/u;

const PLAIN = [
  { design: 'StartPage', code: 'StartPage', route: '' },
  { design: 'MainPage', code: 'PostgradPage', route: 'main' },
  { design: 'StudentsPage', code: 'StudentsPage', route: 'students' },
  { design: 'BusinessPage', code: 'BusinessPage', route: 'business' },
  { design: 'NotFoundPage', code: 'NotFoundPage', route: null },
];

const LEGAL = [
  { design: 'OfferPage', route: 'offer' },
  { design: 'PrivacyPage', route: 'privacy' },
  { design: 'ConsentPage', route: 'consent' },
];

describe('реквизиты общества вне правовых страниц не выводятся', () => {
  for (const page of PLAIN) {
    it(`${page.design}: ни в макете, ни в коде`, () => {
      assert.equal(REQUISITES.test(read(ROOT, 'design', `${page.design}.dc.html`)), false);
      assert.equal(REQUISITES.test(read(SRC, 'components', 'pages', `${page.code}.tsx`)), false);
    });

    if (page.route !== null) {
      it(`/${page.route}: разметка организации без реквизитов`, () => {
        const route = read(SRC, 'app', page.route, 'page.tsx');
        assert.match(route, /<OrgSchema \/>/u);
      });
    }
  }

  it('метаданные всех страниц не называют общество', () => {
    assert.equal(/РУСДРОН/u.test(read(SRC, 'app', 'layout.tsx')), false);
  });

  it('разметка организации добавляет реквизиты только по признаку', () => {
    const schema = read(SRC, 'components', 'OrgSchema.tsx');
    const base = schema.slice(schema.indexOf('const ORG'), schema.indexOf('const REQUISITES'));
    assert.ok(base.length > 0);
    assert.equal(/legalName|taxID|vatID|address/u.test(base), false);
    assert.match(schema, /\.\.\.\(requisites \? REQUISITES : \{\}\)/u);
  });
});

describe('правовые страницы реквизиты сохраняют', () => {
  for (const page of LEGAL) {
    it(`${page.design}: реквизиты на месте, разметка с реквизитами`, () => {
      assert.match(read(SRC, 'components', 'pages', `${page.design}.tsx`), /9723254250/u);
      assert.match(read(SRC, 'app', page.route, 'page.tsx'), /<OrgSchema requisites \/>/u);
    });
  }
});
