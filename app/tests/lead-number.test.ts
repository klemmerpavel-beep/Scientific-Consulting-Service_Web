/**
 * Номер заявки «№ N» без базы (П-3, решение Р-763): запись номера, разбор
 * строки поиска и места, где номер показывается и где его быть не должно.
 * Номер на настоящей базе — `lead-number.db.test.ts`.
 *
 * Запуск: node --test tests/lead-number.test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { leadNumberLabel, leadNumberQuery } from '../src/lib/cabinet/lead-labels.ts';
import { findForbidden } from '../src/lib/cabinet/text-guard.ts';

const APP = path.resolve(import.meta.dirname, '..');
const source = (file: string) => readFileSync(path.join(APP, file), 'utf8');

describe('запись номера', () => {
  it('«№ 17» — одна запись на письма, сигнал и экраны', () => {
    assert.equal(leadNumberLabel(17), '№ 17');
    assert.equal(leadNumberLabel(1), '№ 1');
  });
});

describe('поиск по номеру', () => {
  it('число, «№ 17», «№17», «N 17», «#17» — номер', () => {
    for (const query of ['17', ' 17 ', '№ 17', '№17', 'N 17', 'n17', '#17']) {
      assert.equal(leadNumberQuery(query), 17, query);
    }
  });

  it('текст, пустая строка и число сверх целого поля — не номер', () => {
    for (const query of ['', 'Иванова', '17а', '1 7', '+7 900', '-17', '1234567890']) {
      assert.equal(leadNumberQuery(query), null, query);
    }
  });

  it('поиск «Всех заявок» ищет номер вместе с текстом, подсказка поля его называет', () => {
    const queries = source('src/lib/cabinet/queries.ts');
    const start = queries.indexOf('function leadWhere(');
    const body = queries.slice(start, queries.indexOf('\n}\n', start));
    assert.match(body, /const number = leadNumberQuery\(query\);/u);
    assert.match(body, /\.\.\.\(number === null \? \[\] : \[\{ number \}\]\),/u);
    assert.match(source('src/app/cabinet/manage/leads/page.tsx'), /placeholder="номер, имя, почта, телефон, тема"/u);
  });
});

describe('где номер виден', () => {
  it('перечень — столбцом «№», карточка — «Заявка № N от …», очередь — первым в строке', () => {
    assert.match(source('src/app/cabinet/manage/leads/page.tsx'), /case 'number':[\s\S]*?leadNumberLabel\(lead\.number\)/u);
    assert.match(
      source('src/app/cabinet/manage/leads/[id]/page.tsx'),
      /aside=\{`Заявка \$\{leadNumberLabel\(lead\.number\)\} от \$\{formatDay\(lead\.createdAt\)\}`\}/u,
    );
    assert.match(source('src/app/cabinet/manage/page.tsx'), /\{leadNumberLabel\(lead\.number\)\} · \{leadSourceLabel\(lead\.source\)\}/u);
  });

  it('«Что будет дальше» после «Новой заявки» — номер, сверенный с базой', () => {
    const page = source('src/app/cabinet/request/page.tsx');
    assert.match(page, /await ownRequestNumber\(actor, Number\(params\.sent\)\)/u);
    assert.match(page, /`Менеджер разберёт заявку \$\{leadNumberLabel\(sentNumber\)\} и ответит в течение рабочего дня\.`/u);
    // Без сверенного номера — прежний шаг Р-318.
    assert.match(page, /'Менеджер разберёт заявку и ответит в течение рабочего дня\.'/u);
    const actions = source('src/app/cabinet/actions.ts');
    assert.match(actions, /`\/cabinet\/request\?sent=\$\{number\}`/u);
  });

  it('новые тексты проходят text-guard', () => {
    for (const text of [
      'Менеджер разберёт заявку № 17 и ответит в течение рабочего дня.',
      'Из заявки № 17 от 1 октября 2026',
      'Заявка № 17 от 1 ноября 2026',
    ]) {
      assert.deepEqual(findForbidden(text), [], text);
    }
  });
});

describe('где номера нет', () => {
  it('«Из заявки № N» в «О работе» — только практике, отдельной выборкой', () => {
    const page = source('src/app/cabinet/projects/[code]/page.tsx');
    assert.match(page, /const fromLead = practice \? await projectLead\(actor, project\.id\) : null;/u);
    assert.match(page, /const practice = actor\.role === 'MANAGER' \|\| actor\.role === 'HEAD';/u);
    assert.match(page, /`Из заявки \$\{leadNumberLabel\(fromLead\.number\)\} от \$\{formatDay\(fromLead\.createdAt\)\}`/u);
    // Выборка экрана работы заявку не берёт: номер не попадает в данные
    // экрана клиента (Р-189, Р-362, Р-418).
    const queries = source('src/lib/cabinet/queries.ts');
    const start = queries.indexOf('export async function projectByCode(');
    const body = queries.slice(start, queries.indexOf('\n}\n', start));
    assert.ok(start >= 0);
    assert.doesNotMatch(body, /\blead\b|number:/u);
  });

  it('ответ формы сайта номера не несёт: благодарность (Р-406) прежняя', () => {
    const route = source('src/app/api/lead/route.ts');
    assert.equal(route.match(/NextResponse\.json\(\{ ok: true/gu)?.length, 1);
    assert.match(route, /return NextResponse\.json\(\{ ok: true \}\);/u);
  });

  it('письма после одобрения номер заявки не называют', () => {
    // Приглашение в кабинет и письма о работе начинаются `workLine` —
    // название работы без кода (Р-362); номер заявки туда не подставляется.
    for (const file of ['src/lib/cabinet/projects.ts', 'src/lib/cabinet/events.ts']) {
      const text = source(file);
      const uses = text.match(/leadNumberLabel|lead\.number/gu) ?? [];
      assert.equal(uses.length, 0, `${file}: номер заявки в письмах о работе`);
    }
  });
});
