/**
 * Ответ действия не различает чужой и несуществующий объект (Р-912).
 *
 * Аудит 15.11.2026, находка П-7: действие с чужим идентификатором транша
 * отвечало «Это действие недоступно для вашей роли», с несуществующим —
 * «Транш не найден». Разница выдавала, какие записи есть в базе. Экраны
 * уже отвечают одинаково («не найдено»); действия приведены к тому же.
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const SRC = path.join(import.meta.dirname, '..', 'src');
const actions = readFileSync(path.join(SRC, 'app', 'cabinet', 'actions.ts'), 'utf8');

const pattern = /const MISSING = (\/.+\/u);/u.exec(actions)?.[1] ?? '';
const MISSING = new RegExp(pattern.slice(1, pattern.lastIndexOf('/')), 'u');

/** Все тексты «… не найден(а/о)» из служб кабинета. */
const thrown = readdirSync(path.join(SRC, 'lib', 'cabinet'))
  .filter((name) => name.endsWith('.ts'))
  .flatMap((name) => [
    ...readFileSync(path.join(SRC, 'lib', 'cabinet', name), 'utf8').matchAll(/new Error\('([^']*не найден[^']*)'\)/gu),
  ])
  .map((match) => match[1]!);

describe('чужой объект неотличим от несуществующего (Р-912)', () => {
  it('отказ в праве и отсутствие записи отвечают одной фразой', () => {
    assert.match(actions, /if \(error instanceof AccessDenied\) return HIDDEN_OR_MISSING;/u);
    assert.match(actions, /return MISSING\.test\(error\.message\) \? HIDDEN_OR_MISSING : error\.message;/u);
    assert.doesNotMatch(actions, /Это действие недоступно для вашей роли/u);
  });

  it('фраза не называет, что именно произошло', () => {
    const line = /const HIDDEN_OR_MISSING = '([^']+)'/u.exec(actions)?.[1];
    assert.equal(line, 'Запись не найдена или недоступна для вашей роли');
  });

  it('под правило попадают записи, которые можно перебрать по идентификатору', () => {
    for (const text of ['Транш не найден', 'Версия не найдена', 'Этап не найден', 'Проект не найден', 'Учётная запись не найдена', 'Замечание не найдено', 'Карточка клиента не найдена']) {
      assert.ok(thrown.includes(text), `в службах нет «${text}»`);
      assert.ok(MISSING.test(text), text);
    }
  });

  it('подсказки, что делать дальше, остаются как есть', () => {
    for (const text of thrown.filter((item) => /[:—]/u.test(item) || /с таким кодом|в справочнике/u.test(item))) {
      assert.ok(!MISSING.test(text), text);
    }
    assert.ok(!MISSING.test('Срок этапа не может быть раньше срока работы'));
  });
});
