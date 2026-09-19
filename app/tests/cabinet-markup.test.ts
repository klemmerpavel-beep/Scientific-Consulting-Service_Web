/**
 * Разметка экранов кабинета собирается общими частями, а не пишется заново.
 *
 * Проверка ходит по исходникам, а не по снимкам: снимок показывает только
 * то, что попало в обход, а правило должно запирать все экраны сразу.
 * Прецедент — `text-guard.test.ts`, который проверяет формулировки тем же
 * способом и по той же причине.
 *
 * Поводом послужило решение Р-155: к этому времени формы были набраны в
 * одиннадцати файлах по-своему, объект стиля поля разошёлся на четыре
 * редакции, и высота поля на служебных экранах отличалась от клиентских.
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const SCREENS = path.join(import.meta.dirname, '..', 'src', 'app', 'cabinet');
const COMPONENTS = path.join(import.meta.dirname, '..', 'src', 'components', 'cabinet');

function sources(root: string): string[] {
  return readdirSync(root, { recursive: true })
    .map(String)
    .filter((name) => name.endsWith('.tsx'))
    .map((name) => path.join(root, name));
}

describe('экраны кабинета не пишут разметку форм заново', () => {
  for (const file of sources(SCREENS)) {
    const name = path.relative(SCREENS, file);
    const code = readFileSync(file, 'utf8');

    it(`${name}: форма собрана компонентом`, () => {
      assert.equal(/<form\b/u.test(code), false, 'на экране собственная разметка формы');
    });

    it(`${name}: поля собраны компонентами`, () => {
      assert.equal(/<select\b/u.test(code), false, 'на экране собственный выбор из списка');
      assert.equal(/<textarea\b/u.test(code), false, 'на экране собственное многострочное поле');
      // Скрытое поле разметки не имеет и передаёт форме то, чего человек не
      // вводит: его писать руками правильно.
      for (const field of code.matchAll(/<input\b([^>]*)>/gu)) {
        assert.ok(
          field[1].includes('type="hidden"'),
          `поле помимо скрытого: ${field[0].slice(0, 80)}`,
        );
      }
    });

    it(`${name}: вид кнопки не набирается вручную`, () => {
      assert.equal(
        /className="cab-btn/u.test(code),
        false,
        'вид кнопки задан на экране, а не общей частью',
      );
    });
  }
});

describe('общие части остаются единственным местом вида', () => {
  it('разметка кнопки живёт в components/cabinet', () => {
    const owners = sources(COMPONENTS).filter((file) =>
      /className=\{?[`'"]cab-btn/u.test(readFileSync(file, 'utf8')),
    );
    assert.ok(owners.length > 0, 'вид кнопки не найден ни в одной общей части');
  });
});
