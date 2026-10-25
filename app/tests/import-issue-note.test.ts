/**
 * Отчёт переноса книги показывает исходный текст ячейки и что кабинет с
 * ним сделал (решение Р-732): у замечания строки — пояснение разбора,
 * суммы с разрядами, ячейка «Срок», поправленная разбором, помечена;
 * «учтена доплатой» — только если это подтверждает сохранённое замечание.
 * Правила разбора, таблица «Замечания разбора» и «Исключить строки» не
 * меняются.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { deadlineFixed, issueExplanation } from '../src/lib/cabinet/import/issue-note.ts';

const day = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const rub = (value: number) => BigInt(value) * 100n;
/** Разряды `formatAmount` — неразрывный пробел: сравнение — по обычному. */
const plain = (text: string | null) => (text ?? '').replace(/\s/gu, ' ');

describe('пояснения разбора в строке книги', () => {
  // Пояснения — в том виде, в каком их пишет разбор (`import/etl.ts`).
  it('несуществующая дата — исходный текст и куда отнесён срок', () => {
    const issue = { code: 'NONEXISTENT_DATE', note: '«31.04.2025» — в месяце 30 дн., срок отнесён на последний день' };
    assert.equal(
      issueExplanation(issue, { deadline: day(2025, 4, 30), cost: rub(10_000), paid: 0n }),
      'в книге «31.04.2025» — срок отнесён на 30 апреля 2025',
    );
  });

  it('срок без года — год восстановлен', () => {
    const issue = { code: 'DEADLINE_WITHOUT_YEAR', note: '«18 декабря» — год восстановлен как 2025' };
    assert.equal(issueExplanation(issue, { deadline: day(2025, 12, 18), cost: 0n, paid: 0n }), 'в книге «18 декабря» — год восстановлен как 2025');
  });

  it('нераспознанный срок — исходный текст', () => {
    assert.equal(
      issueExplanation({ code: 'UNPARSED_DEADLINE', note: 'к лету' }, { deadline: null, cost: 0n, paid: 0n }),
      'в книге «к лету» — срок не прочитан',
    );
  });

  it('суммы — в рублях с разрядами', () => {
    const over = { code: 'PAYMENT_EXCEEDS_CONTRACT', note: 'оплачено больше стоимости на 5000 ₽ — учтено доплатой сверх договора' };
    assert.equal(plain(issueExplanation(over, { deadline: null, cost: rub(45_000), paid: rub(50_000) })), 'переплата 5 000 ₽ — учтена доплатой');
    const rest = { code: 'CLOSED_WITH_OUTSTANDING_BALANCE', note: 'работа закрыта, остаток 50000 ₽' };
    assert.equal(plain(issueExplanation(rest, { deadline: null, cost: rub(80_000), paid: rub(30_000) })), 'работа закрыта, остаток 50 000 ₽');
    assert.doesNotMatch(issueExplanation(rest, { deadline: null, cost: rub(80_000), paid: rub(30_000) }) ?? '', /\d{4,}/u);
  });

  it('«учтена доплатой» — только если это подтверждает сохранённое замечание (до Р-273 доплата не заводилась)', () => {
    const row = { deadline: null, cost: rub(25_000), paid: rub(30_000) };
    // Загрузка до Р-273 (29.09.2026): переплата — ошибка, доплаты нет.
    const old = { code: 'PAYMENT_EXCEEDS_CONTRACT', note: 'оплачено больше стоимости на 5000 ₽' };
    assert.equal(plain(issueExplanation(old, row)), 'переплата 5 000 ₽');
    assert.equal(plain(issueExplanation({ ...old, severity: 'ERROR' }, row)), 'переплата 5 000 ₽');
    // С Р-273: слова разбора или вес «предупреждение».
    const now = { code: 'PAYMENT_EXCEEDS_CONTRACT', note: 'оплачено больше стоимости на 5000 ₽ — учтено доплатой сверх договора' };
    assert.equal(plain(issueExplanation(now, row)), 'переплата 5 000 ₽ — учтена доплатой');
    assert.equal(plain(issueExplanation({ code: 'PAYMENT_EXCEEDS_CONTRACT', note: '', severity: 'WARNING' }, row)), 'переплата 5 000 ₽ — учтена доплатой');
    // Без стоимости — ошибка и прежде, и теперь: договора нет.
    assert.equal(
      plain(issueExplanation({ code: 'PAYMENT_EXCEEDS_CONTRACT', note: 'оплачено больше стоимости на 30000 ₽' }, { deadline: null, cost: 0n, paid: rub(30_000) })),
      'оплачено 30 000 ₽ при пустой стоимости',
    );
  });

  it('заливка — без машинного кода цвета; неясное соответствие — в «Решении»', () => {
    const fill = { code: 'STATUS_FILL_CONFLICT', note: 'текст «закрыт» расходится с заливкой FFFF0000' };
    assert.equal(issueExplanation(fill, { deadline: null, cost: 0n, paid: 0n }), 'в книге «закрыт» — расходится с заливкой ячейки');
    assert.equal(issueExplanation({ code: 'PREVIOUS_WORK_UNCLEAR', note: 'похожих работ две' }, { deadline: null, cost: 0n, paid: 0n }), null);
  });

  it('«поправлено» — у срока, который разбор поправил сам', () => {
    assert.equal(deadlineFixed([{ code: 'NONEXISTENT_DATE', note: '' }]), true);
    assert.equal(deadlineFixed([{ code: 'DEADLINE_WITHOUT_YEAR', note: '' }]), true);
    assert.equal(deadlineFixed([{ code: 'UNPARSED_DEADLINE', note: 'к лету' }, { code: 'DUPLICATE_CLIENT_BY_NAME', note: '' }]), false);
  });
});

describe('экран отчёта', () => {
  const page = readFileSync(
    path.join(import.meta.dirname, '..', 'src', 'app', 'cabinet', 'manage', 'import', '[batchId]', 'page.tsx'),
    'utf8',
  );

  it('строка книги: пояснение у замечания, пометка у срока', () => {
    assert.match(page, /const why = issueExplanation\(issue, row\);\s*return why === null \? issue\.label : `\$\{issue\.label\}: \$\{why\}`;/u);
    assert.match(page, /\{formatDate\(row\.deadline\) \?\? '—'\}\s*\{deadlineFixed\(row\.issues\) \? ' · поправлено' : ''\}/u);
  });

  it('таблица строк — не уже 1100 px: на телефоне пояснения в «Состоянии» не тянут строку в высоту', () => {
    assert.match(page, /const BOOK_TABLE_MIN_WIDTH = 1100;/u);
    assert.match(page, /label="Строки книги"\s*minWidth=\{BOOK_TABLE_MIN_WIDTH\}/u);
    // Предел — у таблицы: наименьшая ширина столбца меняла бы раскладку на 1440.
    assert.match(page, /<th style=\{TABLE_HEAD\} scope="col">Состояние<\/th>/u);
  });

  it('таблица замечаний — прежняя: название, число, номера строк', () => {
    assert.match(page, /<td style=\{TABLE_CELL\}>\{seen\?\.label \?\? code\}<\/td>\s*<td style=\{TABLE_NUM\}>\{count\}<\/td>/u);
  });
});
