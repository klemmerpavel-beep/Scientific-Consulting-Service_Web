/**
 * Куратор без договора поручения: «Сообщить руководителю» — в ответе
 * первого экрана (решение Р-735). Прежде ответа в шапке не было, под
 * заголовком стоял блок первого входа о сдаче этапов, которых куратор не
 * видит, а единственное действие — внизу, на 390 px на 1208 px от верха.
 * Тексты пояснения и правило «не чаще раза в сутки» прежние (Р-331); у
 * куратора с договором экран не меняется.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const page = readFileSync(path.join(import.meta.dirname, '..', 'src', 'app', 'cabinet', 'projects', 'page.tsx'), 'utf8');

describe('ответ куратору без договора поручения (Р-735)', () => {
  const branch = page.slice(page.indexOf('} else if (awaitingNda) {'), page.indexOf('} else if (forExpert) {'));

  it('ответ строится и при отсутствии договора', () => {
    assert.ok(branch.length > 0, 'нет ветки ответа без договора');
    assert.match(branch, /lead: 'Доступ к материалам ещё не открыт\.'/u);
  });

  it('пояснение и правило «раз в сутки» — прежними словами', () => {
    assert.match(branch, /detail: 'Он открывается после подписания договора поручения обработки персональных данных\.'/u);
    assert.match(branch, /'Договор оформляет руководитель практики и отмечает его в кабинете\.'/u);
    assert.match(branch, /const asked = askedAt !== null && !ndaRequestOpen\(askedAt, now\(\)\);/u);
    assert.match(branch, /`Руководитель получил уведомление \$\{formatDay\(askedAt\)\} в \$\{formatTime\(askedAt\)\}\. Повторно сообщить можно через сутки\.`/u);
  });

  it('кнопка «Сообщить руководителю» — действием ответа; внизу экрана её нет', () => {
    assert.match(branch, /<Form action=\{requestNdaAction\} inline>\s*<Button tone="quiet">Сообщить руководителю<\/Button>/u);
    assert.equal([...page.matchAll(/Сообщить руководителю<\/Button>/gu)].length, 1);
    assert.match(page, /\{awaitingNda \? null : projects\.length === 0 \? \(/u);
  });

  it('у куратора с договором ответ — прежняя ветка дел', () => {
    assert.match(page, /\} else if \(forExpert\) \{\s*\/\/ Ответ куратору — главное дело по ближайшему сроку/u);
  });
});
