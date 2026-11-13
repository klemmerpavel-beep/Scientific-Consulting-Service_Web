/**
 * «Заказы» без базы (решение Р-874): столбцы — как в книге заказов
 * владельца, описание работы и остаток со знаком, итог «Сумма» в книге
 * Excel — под таблицей и вне фильтра; книга без итога — прежняя байт в
 * байт; пункт меню и права.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { can, type Actor } from '../src/lib/cabinet/access.ts';
import { readWorkbook } from '../src/lib/cabinet/import/xlsx.ts';
import { unzip } from '../src/lib/cabinet/import/zip.ts';
import { navFor } from '../src/lib/cabinet/nav.ts';
import {
  ORDER_COLUMNS,
  orderBalanceValue,
  orderDescription,
  orderFoot,
  orderTotals,
  workbook,
  type OrderRowView,
} from '../src/lib/cabinet/table-views.ts';
import { xlsx } from '../src/lib/disk/xlsx.ts';

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

const rows: OrderRowView[] = [
  {
    code: 'PD-2026-010',
    orderedOn: day('2026-10-01'),
    client: 'Орлова Анна Викторовна',
    type: 'ВКР бакалавра',
    title: 'ВКР бакалавра',
    topic: 'Учёт расчётов с поставщиками',
    dueOn: day('2027-05-30'),
    status: 'ACTIVE',
    contract: 12_000_000n,
    received: 4_000_000n,
    rest: 8_000_000n,
    overpaid: 0n,
  },
  {
    code: 'PD-2026-011',
    orderedOn: day('2026-09-15'),
    client: 'Лебедев Пётр',
    type: 'Статья',
    title: 'Статья Q2',
    topic: null,
    dueOn: null,
    status: 'COMPLETED',
    contract: 5_000_000n,
    received: 5_500_000n,
    rest: 0n,
    overpaid: 500_000n,
  },
  {
    code: 'PD-2026-012',
    orderedOn: day('2026-09-01'),
    client: 'Сомов Илья',
    type: 'Консультация',
    title: 'Консультация',
    topic: null,
    dueOn: null,
    status: 'ACTIVE',
    contract: null,
    received: 0n,
    rest: null,
    overpaid: 0n,
  },
];

describe('«Заказы»: столбцы и итог', () => {
  it('столбцы — книги заказов владельца в её порядке и остаток', () => {
    assert.deepEqual(
      ORDER_COLUMNS.map((column) => column.head),
      [
        'Дата',
        'Заказчик (ФИО)',
        'Тип работы',
        'Описание работы',
        'Дедлайн по работе',
        'Стоимость, руб.',
        'Статус работы',
        'Оплачено, руб.',
        'Остаток, руб.',
      ],
    );
  });

  it('описание не повторяет тип работы и название', () => {
    assert.equal(orderDescription(rows[0]!), 'Учёт расчётов с поставщиками');
    assert.equal(orderDescription(rows[1]!), 'Статья Q2');
    assert.equal(orderDescription(rows[2]!), 'Консультация');
    assert.equal(orderDescription({ type: 'Диссертация', title: 'Модель отказов', topic: 'Надёжность узлов' }), 'Модель отказов — Надёжность узлов');
  });

  it('остаток со знаком: долг — плюс, переплата — минус, без договора — пусто', () => {
    assert.equal(orderBalanceValue(rows[0]!), 8_000_000n);
    assert.equal(orderBalanceValue(rows[1]!), -500_000n);
    assert.equal(orderBalanceValue(rows[2]!), null);
    assert.deepEqual(orderTotals(rows), { contract: 17_000_000n, received: 9_500_000n, rest: 8_000_000n, overpaid: 500_000n });
  });

  it('книга: строки как на экране, итог «Сумма» под таблицей и вне фильтра', () => {
    const book = Buffer.from(workbook('Заказы', ORDER_COLUMNS, rows, orderFoot(rows)));
    const [sheet] = readWorkbook(book);
    assert.equal(sheet?.name, 'Заказы');
    const lines = sheet!.rows;
    assert.equal(lines[0]?.cells.A?.value, 'Дата');
    assert.equal(lines[1]?.cells.B?.value, 'Орлова Анна Викторовна');
    assert.equal(lines[1]?.cells.F?.value, '120000.00');
    assert.equal(lines[2]?.cells.I?.value, '-5000.00', 'переплата не со знаком минус');
    assert.equal(lines[3]?.cells.F, undefined, 'у работы без договора стоимость не пуста');
    const foot = lines[4]!;
    assert.equal(foot.cells.A?.value, 'Сумма');
    assert.equal(foot.cells.F?.value, '170000.00');
    assert.equal(foot.cells.H?.value, '95000.00');
    assert.equal(foot.cells.I?.value, '75000.00', 'остаток итога — долг без переплаты');
    const parts = unzip(book);
    const sheetXml = parts.get('xl/worksheets/sheet1.xml')!.toString('utf8');
    assert.match(sheetXml, /<autoFilter ref="A1:I4"\/>/u, 'итог попал в фильтр');
    assert.match(parts.get('xl/styles.xml')!.toString('utf8'), /<cellXfs count="7">/u);
  });

  it('книга без итога — прежняя: стилей пять, фильтр по всем строкам', () => {
    const plain = xlsx({ title: 'Лист', head: ['А'], rows: [['1']] });
    const parts = unzip(plain);
    assert.match(parts.get('xl/styles.xml')!.toString('utf8'), /<cellXfs count="5">/u);
    assert.doesNotMatch(parts.get('xl/styles.xml')!.toString('utf8'), /<borders count="3">/u);
  });
});

describe('«Заказы»: меню и права', () => {
  const base: Actor = { id: 'u', role: 'HEAD', status: 'ACTIVE', clientProfileId: null, expertNdaSignedAt: null };
  const head = base;
  const manager: Actor = { ...base, role: 'MANAGER' };
  const expert: Actor = { ...base, role: 'EXPERT', expertNdaSignedAt: new Date() };
  const client: Actor = { ...base, role: 'CLIENT', clientProfileId: 'c' };

  it('пункт «Заказы» — у руководителя и менеджера, у клиента и куратора его нет', () => {
    assert.ok(navFor(head).some((item) => item.href === '/cabinet/manage/orders' && item.label === 'Заказы'));
    assert.ok(navFor(manager).some((item) => item.href === '/cabinet/manage/orders' && item.label === 'Заказы'));
    assert.equal(navFor(expert).some((item) => item.href === '/cabinet/manage/orders'), false);
    assert.equal(navFor(client).some((item) => item.href === '/cabinet/manage/orders'), false);
  });

  it('экран и выгрузка спрашивают право на сервере', () => {
    assert.equal(can(client, 'REGISTRY_VIEW'), false);
    assert.equal(can(expert, 'REGISTRY_VIEW'), false);
    const root = path.join(import.meta.dirname, '..', 'src');
    const page = readFileSync(path.join(root, 'app', 'cabinet', 'manage', 'orders', 'page.tsx'), 'utf8');
    const route = readFileSync(path.join(root, 'app', 'cabinet', 'manage', 'orders', 'export', 'route.ts'), 'utf8');
    const lib = readFileSync(path.join(root, 'lib', 'cabinet', 'orders.ts'), 'utf8');
    assert.match(page, /if \(!can\(actor, 'REGISTRY_VIEW'\)\) redirect\(homeFor\(actor\)\)/u);
    assert.match(route, /AccessDenied\) return new NextResponse\('Не найдено', \{ status: 404 \}\)/u);
    assert.match(lib, /export async function ordersTable[\s\S]*?ensure\(actor, 'REGISTRY_VIEW'\);\n  const scope = scopeProjects\(actor\);/u);
  });
});
