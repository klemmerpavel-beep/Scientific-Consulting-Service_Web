/**
 * Сверка книги с перенесённым, надгробия стёртых строк и приведение
 * контактов — без базы (решение Р-252). Здесь же чистые правила очереди,
 * письма об отказе и таблиц зеркала, поправленные тем же решением.
 *
 * Книга — синтетическая, имена вымышлены: настоящая книга заказов в
 * репозиторий не попадает.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { contactKeys, emailKey, leadMatchesContacts, phoneKey } from '../src/lib/cabinet/contacts.ts';
import { telegramPermanent } from '../src/lib/cabinet/events.ts';
import { erasedKey, normalizeName, parseBook, signatureBase } from '../src/lib/cabinet/import/etl.ts';
import { changed, matchBook, type KnownWork } from '../src/lib/cabinet/import/match.ts';
import { readWorkbook } from '../src/lib/cabinet/import/xlsx.ts';
import { declineLetterFor } from '../src/lib/cabinet/lead-letter.ts';
import { hideAddresses, smtpPermanent, smtpUnreachable } from '../src/lib/cabinet/mail.ts';
import { csv, mskDay, mskMoment } from '../src/lib/disk/table.ts';
import { excelSerial, makeWorkbook, type TestRow } from './helpers/make-workbook.ts';

const HEADER: TestRow = ['Дата', 'Заказчик (ФИО)', 'Тип работы', 'Описание работы', 'Дедлайн', 'Стоимость', 'Статутус работы', 'Оплачено'];

function book(rows: TestRow[]) {
  return parseBook(readWorkbook(makeWorkbook([HEADER, ...rows])));
}

const line = (customer: string, type: string, cost: string): TestRow => [
  excelSerial('2025-04-01'),
  customer,
  type,
  'Описание',
  excelSerial('2025-09-01'),
  cost,
  'закрыт',
  cost,
];

/** Прежняя формула ключа — с суммой последним полем. */
const legacy = (customer: string, type: string, cost: string) =>
  `${excelSerial('2025-04-01')}|${normalizeName(customer)}|${normalizeName(type)}|${cost}`;

const work = (projectId: string, signature: string, cost: string, order = 1): KnownWork => ({
  signature,
  projectId,
  parsed: { cost, paid: cost, status: 'CLOSED', deadline: null },
  order,
});

describe('ключ строки без суммы', () => {
  it('правка суммы ключ не меняет', () => {
    const before = book([line('Зимина Ольга', 'Диссертция', '100000')]).rows[0]!;
    const after = book([line('Зимина Ольга', 'Диссертция', '120000')]).rows[0]!;
    assert.equal(before.signature, after.signature);
    assert.match(before.signature, /^k2\|/u);
    assert.doesNotMatch(before.signature, /10000000/u);
  });

  it('основа одна у старого и нового ключа той же строки', () => {
    const fresh = book([line('Зимина Ольга', 'Диссертция', '100000')]).rows[0]!.signature;
    assert.equal(signatureBase(fresh), signatureBase(legacy('Зимина Ольга', 'Диссертция', '10000000')));
    assert.equal(signatureBase(`${fresh}|#2`), signatureBase(fresh));
    assert.equal(signatureBase(`${legacy('Зимина Ольга', 'Диссертция', '1')}|#3`), signatureBase(fresh));
  });

  it('надгробие не хранит ФИО и не зависит от суммы и формулы ключа', () => {
    const fresh = book([line('Зимина Ольга', 'Диссертция', '100000')]).rows[0]!.signature;
    const tomb = erasedKey(fresh)!;
    assert.match(tomb, /^erased:[0-9a-f]{64}$/u);
    assert.equal(erasedKey(legacy('Зимина Ольга', 'Диссертция', '999')), tomb);
    assert.equal(erasedKey(tomb), null, 'надгробие от надгробия');
    assert.equal(signatureBase(tomb), null);
    assert.equal(erasedKey(null), null);
  });
});

describe('сверка с перенесённым', () => {
  const rowOf = (customer: string, cost: bigint) => ({
    signature: book([line(customer, 'Диссертция', '1')]).rows[0]!.signature,
    cost,
  });

  it('строка со старым ключом находит свою работу — и при той же сумме, и при новой', () => {
    const known = [work('p1', legacy('Зимина Ольга', 'Диссертция', '10000000'), '10000000')];
    assert.deepEqual(
      matchBook([rowOf('Зимина Ольга', 10_000_000n)], known, new Set()).map((m) => m.kind),
      ['KNOWN'],
    );
    const edited = matchBook([rowOf('Зимина Ольга', 12_000_000n)], known, new Set());
    assert.equal(edited[0]?.kind, 'KNOWN', 'старая подпись с другой суммой дала новую работу');
    assert.equal(edited[0]?.kind === 'KNOWN' && edited[0].projectId, 'p1');
  });

  it('из строк одной работы сравнивается последняя', () => {
    const known = [
      work('p1', legacy('Зимина Ольга', 'Диссертция', '10000000'), '10000000', 1),
      work('p1', rowOf('Зимина Ольга', 0n).signature, '12000000', 2),
    ];
    const [match] = matchBook([rowOf('Зимина Ольга', 12_000_000n)], known, new Set());
    assert.equal(match?.kind, 'KNOWN');
    assert.equal((match as { parsed: { cost: string } }).parsed.cost, '12000000');
  });

  it('близнецы сводятся по сумме; обе поправленные — на разбор', () => {
    const a = rowOf('Зимина Ольга', 3_000_000n);
    const b = { ...a, cost: 4_000_000n };
    const known = [
      work('p1', a.signature!, '3000000', 1),
      work('p2', `${a.signature}|#2`, '4000000', 2),
    ];
    const same = matchBook([a, b], known, new Set());
    assert.deepEqual(same.map((m) => (m.kind === 'KNOWN' ? m.projectId : m.kind)), ['p1', 'p2']);

    const both = matchBook([{ ...a, cost: 3_100_000n }, { ...b, cost: 4_100_000n }], known, new Set());
    assert.deepEqual(both.map((m) => m.kind), ['UNCLEAR', 'UNCLEAR']);

    const one = matchBook([a, { ...b, cost: 4_500_000n }], known, new Set());
    assert.deepEqual(one.map((m) => (m.kind === 'KNOWN' ? m.projectId : m.kind)), ['p1', 'p2']);
  });

  it('новый заказ того же дня и типа рядом с перенесённым — новая работа', () => {
    const a = rowOf('Зимина Ольга', 3_000_000n);
    const known = [work('p1', a.signature!, '3000000')];
    const result = matchBook([a, { ...a, cost: 5_000_000n }], known, new Set());
    assert.deepEqual(result.map((m) => m.kind), ['KNOWN', 'NEW']);
  });

  it('одна строка на две работы без совпадения суммы — на разбор', () => {
    const a = rowOf('Зимина Ольга', 9_000_000n);
    const known = [work('p1', a.signature!, '3000000', 1), work('p2', `${a.signature}|#2`, '4000000', 2)];
    assert.deepEqual(matchBook([a], known, new Set()).map((m) => m.kind), ['UNCLEAR']);
  });

  it('строка стёртого заказчика не переносится при любой сумме', () => {
    const a = rowOf('Зимина Ольга', 3_000_000n);
    const tombs = new Set([erasedKey(legacy('Зимина Ольга', 'Диссертция', '1'))!]);
    assert.deepEqual(matchBook([a, { ...a, cost: 1n }], [], tombs).map((m) => m.kind), ['ERASED', 'ERASED']);
    assert.deepEqual(matchBook([{ signature: erasedKey(a.signature), cost: 0n }], [], new Set()).map((m) => m.kind), ['ERASED']);
  });

  it('изменением считается и правка срока', () => {
    const before = { cost: '1', paid: '1', status: 'CLOSED', deadline: '2025-09-01T00:00:00.000Z' };
    assert.equal(changed(before, before), false);
    assert.equal(changed({ ...before, deadline: '2025-10-01T00:00:00.000Z' }, before), true);
    assert.equal(changed({ ...before, cost: '2' }, before), true);
    assert.equal(changed(before, null), true);
  });
});

describe('контакты субъекта в виде сверки', () => {
  it('почта — без пробелов и регистра, телефон — последние десять цифр', () => {
    assert.equal(emailKey(' Ivanov@Mail.RU '), 'ivanov@mail.ru');
    assert.equal(emailKey('+7 900 000-00-00'), null);
    assert.equal(phoneKey('+7 (900) 123-45-67'), '9001234567');
    assert.equal(phoneKey('8 900 123 45 67'), '9001234567');
    assert.equal(phoneKey('123-45'), null, 'обрывок номера не сверяется');
    assert.equal(phoneKey(null), null);
  });

  it('заявка находится по почте, телефону контакта и телефону из кабинета', () => {
    const keys = contactKeys(['ivanov@mail.ru', '+7 900 123-45-67', null, '  ']);
    assert.ok(leadMatchesContacts({ contact: 'IVANOV@mail.ru', phone: null }, keys));
    assert.ok(leadMatchesContacts({ contact: '8(900)1234567', phone: null }, keys));
    assert.ok(leadMatchesContacts({ contact: 'other@mail.ru', phone: '89001234567' }, keys));
    assert.ok(!leadMatchesContacts({ contact: 'other@mail.ru', phone: null }, keys));
  });

  it('цифры в адресе почты за телефон не принимаются', () => {
    const keys = contactKeys(['+7 900 123-45-67']);
    assert.ok(!leadMatchesContacts({ contact: 'n9001234567@mail.ru', phone: null }, keys));
  });
});

describe('письмо об отказе', () => {
  it('заявке с сайта — без имени и темы с открытой формы', () => {
    const { body } = declineLetterFor(
      { source: 'landing', name: 'https://example.invalid/приз', topic: 'Заберите выигрыш: example.invalid' },
      'Тема вне наших направлений.',
    );
    assert.ok(body.startsWith('Здравствуйте.\n'));
    assert.doesNotMatch(body, /example\.invalid/u);
    assert.match(body, /Причина: Тема вне наших направлений\./u);
  });

  it('заявке из кабинета — с именем и темой', () => {
    const { body } = declineLetterFor({ source: 'cabinet', name: 'Анна', topic: 'Кубиты' }, 'Причина.');
    assert.ok(body.startsWith('Здравствуйте, Анна.'));
    assert.match(body, /по теме «Кубиты»/u);
  });
});

describe('отказы доставки', () => {
  it('адреса почты вырезаются из текста ошибки', () => {
    const text = hideAddresses('Error: 550 5.1.1 <Ivanov.I@mail.ru>: user unknown; to=petrova@example.org');
    assert.doesNotMatch(text, /@/u);
    assert.match(text, /550 5\.1\.1 <<адрес>>: user unknown/u);
  });

  it('окончательный отказ SMTP — код 5xx, сетевой сбой — нет', () => {
    assert.equal(smtpPermanent(Object.assign(new Error('x'), { responseCode: 550 })), true);
    assert.equal(smtpPermanent(Object.assign(new Error('x'), { responseCode: 421 })), false);
    // Отказ связи — не ответ сервера: такие строки прохода откладываются (Р-255).
    assert.equal(smtpUnreachable(Object.assign(new Error('Connection timeout'), { code: 'ETIMEDOUT' })), true);
    assert.equal(smtpUnreachable(Object.assign(new Error('x'), { code: 'ESOCKET' })), true);
    assert.equal(smtpUnreachable(Object.assign(new Error('x'), { code: 'EENVELOPE', responseCode: 550 })), false);
    assert.equal(smtpUnreachable(Object.assign(new Error('x'), { code: 'ECONNECTION', responseCode: 421 })), false);
    assert.equal(smtpPermanent(Object.assign(new Error('x'), { code: 'ETIMEDOUT' })), false);
    assert.equal(smtpPermanent(null), false);
  });

  it('Telegram: 400 и 403 окончательны, отказ самого бота и перегрузка — нет', () => {
    assert.equal(telegramPermanent(400), true);
    assert.equal(telegramPermanent(403), true);
    for (const status of [401, 404, 429, 500, 502]) assert.equal(telegramPermanent(status), false);
  });
});

describe('таблицы зеркала', () => {
  it('поля делятся точкой с запятой, как в выгрузках кабинета', () => {
    const text = csv(['Дата (МСК)', 'Сумма'], [['2026-09-26', '123,45']]);
    assert.equal(text, '﻿"Дата (МСК)";"Сумма"\r\n"2026-09-26";"123,45"\r\n');
  });

  it('день и момент — по Москве', () => {
    const late = new Date('2026-09-25T22:30:00Z'); // 01:30 26 сентября по Москве
    assert.equal(mskDay(late), '2026-09-26');
    assert.equal(mskMoment(late), '2026-09-26 01:30');
    assert.equal(mskDay(new Date('2026-09-01T00:00:00Z')), '2026-09-01', 'дата без времени сдвинулась');
    assert.equal(mskDay(null), '');
  });
});
