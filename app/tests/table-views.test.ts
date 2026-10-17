/**
 * Наборы столбцов и выгрузки таблиц кабинета (план по образцу, К-3,
 * решение Р-593): что видно на экране, то и выгружается — тем же набором
 * и в том же порядке; в книге деньги остаются числами, а выгрузка «Работ»
 * денег не несёт.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { readWorkbook } from '../src/lib/cabinet/import/xlsx.ts';
import {
  COLUMN_SETS,
  FINANCE_COLUMNS,
  LEAD_COLUMNS,
  PROJECT_COLUMNS,
  columnSet,
  leadColumns,
  pick,
  sheetRows,
  workbook,
  type FinanceRowView,
  type LeadRowView,
  type ProjectRowView,
} from '../src/lib/cabinet/table-views.ts';

const lead: LeadRowView = {
  createdAt: new Date('2026-10-14T21:30:00Z'),
  source: 'postgrad',
  form: 'top',
  name: 'Ирина',
  contact: '+7 900 000-00-00',
  contactKind: 'phone',
  organization: null,
  topic: null,
  need: 'Глава 2',
  deadline: 'декабрь',
  message: '=HYPERLINK("http://x")',
  status: 'NEW',
  projectId: null,
  consentGiven: true,
  marketingOptIn: false,
};

const finance: FinanceRowView = {
  code: 'PD-2026-001',
  title: 'Диссертация',
  client: 'Клиент А.',
  status: 'IN_PROGRESS',
  manager: { fullName: 'Менеджер М.' },
  expert: null,
  contracted: 12_345_678n,
  received: 5_000_000n,
  awaiting: 7_345_678n,
  lost: 0n,
  accrued: 1_000_000n,
  margin: -50_000n,
  typeExpenses: 120_000n,
  net: -170_000n,
  netShare: -1.3,
};

const project: ProjectRowView = {
  code: 'PD-2026-002',
  title: 'Статья ВАК',
  status: 'ACTIVE',
  dueOn: new Date('2026-12-01T00:00:00Z'),
  serviceType: { name: 'Статья' },
  client: { fullName: 'Клиент Б.' },
  manager: { fullName: 'Менеджер М.' },
  expert: null,
  expertNameRaw: '  Куратор К.  ',
  stages: [{ state: 'DONE' }, { state: 'DONE' }, { state: 'AWAITING_CLIENT' }, { state: 'NOT_STARTED' }],
};

describe('наборы столбцов', () => {
  it('два набора; неизвестное значение адреса — основные столбцы', () => {
    assert.deepEqual(
      COLUMN_SETS.map((set) => set.key),
      ['short', 'full'],
    );
    assert.equal(columnSet('full'), 'full');
    assert.equal(columnSet('short'), 'short');
    assert.equal(columnSet(undefined), 'short');
    assert.equal(columnSet('FULL'), 'short');
    assert.equal(columnSet('<script>'), 'short');
  });

  it('подробный набор — все столбцы в порядке описания, основной — его часть в том же порядке', () => {
    const keys = (columns: readonly { readonly key: string }[]) => columns.map((column) => column.key);
    const sets = [
      [keys(LEAD_COLUMNS), keys(pick(LEAD_COLUMNS, 'full')), keys(pick(LEAD_COLUMNS, 'short'))],
      [keys(FINANCE_COLUMNS), keys(pick(FINANCE_COLUMNS, 'full')), keys(pick(FINANCE_COLUMNS, 'short'))],
    ];
    for (const [all, full, short] of sets) {
      assert.deepEqual(full, all);
      assert.ok(short!.length > 0 && short!.length < full!.length);
      assert.deepEqual(short, full!.filter((key) => short!.includes(key)));
    }
  });

  it('ключи и заголовки столбцов не повторяются', () => {
    for (const columns of [LEAD_COLUMNS, FINANCE_COLUMNS, PROJECT_COLUMNS]) {
      assert.equal(new Set(columns.map((column) => column.key)).size, columns.length);
      assert.equal(new Set(columns.map((column) => column.head)).size, columns.length);
    }
  });

  it('на экранах кабинета нет слов «исполнитель» и «эксперт» — только «куратор»', () => {
    for (const columns of [LEAD_COLUMNS, FINANCE_COLUMNS, PROJECT_COLUMNS]) {
      for (const column of columns) assert.doesNotMatch(column.head, /исполнител|эксперт/iu);
    }
    assert.ok(FINANCE_COLUMNS.some((column) => column.head === 'Куратор'));
    assert.ok(PROJECT_COLUMNS.some((column) => column.head === 'Куратор'));
  });
});

describe('«Все заявки»', () => {
  it('подробный набор — пятнадцать столбцов прежней выгрузки', () => {
    assert.deepEqual(
      leadColumns('full').map((column) => column.head),
      [
        'Дата (МСК)',
        'Страница',
        'Форма',
        'Имя',
        'Контакт',
        'Вид контакта',
        'Организация',
        'Тема',
        'Что нужно',
        'Срок',
        'Сообщение',
        'Согласие',
        'Рассылка',
        'Состояние',
        'Работа заведена',
      ],
    );
  });

  it('основной набор — шесть столбцов экрана', () => {
    assert.deepEqual(
      leadColumns('short').map((column) => column.head),
      ['Дата (МСК)', 'Страница', 'Имя', 'Контакт', 'Тема', 'Состояние'],
    );
  });

  it('«Тема» без темы: в основном наборе — что нужно, в подробном — пусто, «что нужно» своим столбцом', () => {
    const topic = (set: 'short' | 'full') => leadColumns(set).find((column) => column.key === 'topic')!.value(lead);
    assert.equal(topic('short'), 'Глава 2');
    assert.equal(topic('full'), '');
    assert.equal(leadColumns('full').find((column) => column.key === 'need')!.value(lead), 'Глава 2');
  });

  it('значения строки: время по Москве, подписи состояния и вида контакта, да и нет', () => {
    const [row] = sheetRows(leadColumns('full'), [lead]);
    const byHead = Object.fromEntries(leadColumns('full').map((column, index) => [column.head, row![index]]));
    assert.equal(byHead['Дата (МСК)'], '2026-10-15 00:30');
    assert.equal(byHead['Вид контакта'], 'Телефон');
    assert.equal(byHead['Форма'], 'Первый экран');
    assert.equal(leadColumns('full')[2]!.value({ ...lead, form: 'neizvestnaya' }), 'neizvestnaya');
    assert.equal(byHead['Организация'], '');
    assert.equal(byHead['Согласие'], 'да');
    assert.equal(byHead['Рассылка'], 'нет');
    assert.equal(byHead['Работа заведена'], 'нет');
    assert.notEqual(byHead['Состояние'], 'NEW');
  });

  it('сообщение-формула из формы сайта остаётся в книге текстом', () => {
    const [sheet] = readWorkbook(Buffer.from(workbook('Заявки', leadColumns('full'), [lead])));
    const message = Object.values(sheet!.rows[1]!.cells).find((cell) => cell?.value === lead.message);
    assert.ok(message);
    assert.equal(message.type, 'inlineStr');
  });
});

describe('«Деньги по работам»', () => {
  it('основной набор — семь столбцов экрана', () => {
    assert.deepEqual(
      pick(FINANCE_COLUMNS, 'short').map((column) => column.head),
      ['Проект', 'Клиент', 'Договор', 'Получено', 'К получению', 'Начислено', 'Маржа'],
    );
  });

  it('деньги в книге — числа в рублях с копейками, со знаком', () => {
    const columns = pick(FINANCE_COLUMNS, 'full');
    const [sheet] = readWorkbook(Buffer.from(workbook('Деньги по работам', columns, [finance])));
    const head = sheet!.rows[0]!.cells;
    const row = sheet!.rows[1]!.cells;
    const at = (title: string) => {
      const letter = Object.keys(head).find((key) => head[key]?.value === title)!;
      return row[letter];
    };
    assert.equal(at('Договор')?.value, '123456.78');
    assert.notEqual(at('Договор')?.type, 'inlineStr');
    assert.equal(at('Маржа')?.value, '-500.00');
    assert.equal(at('Списано')?.value, '0.00');
    assert.equal(at('Куратор'), undefined);
    assert.equal(at('Код')?.value, 'PD-2026-001');
    // Экономика работы (К-4, Р-594): расходы вида и маржа после них —
    // деньгами, доля — числом процентов.
    assert.equal(at('Расходы вида')?.value, '1200.00');
    assert.equal(at('Маржа после расходов вида')?.value, '-1700.00');
    assert.equal(at('Доля маржи после расходов, %')?.value, '-1.3');
    assert.notEqual(at('Доля маржи после расходов, %')?.type, 'inlineStr');
  });

  it('подробный набор кончается экономикой работы; без доли — пустая ячейка', () => {
    assert.deepEqual(
      pick(FINANCE_COLUMNS, 'full').slice(-4).map((column) => column.head),
      ['Маржа', 'Расходы вида', 'Маржа после расходов вида', 'Доля маржи после расходов, %'],
    );
    const share = FINANCE_COLUMNS.find((column) => column.key === 'netShare')!;
    assert.equal(share.value({ ...finance, netShare: null }), null);
  });

  it('денежные и долевые столбцы помечены числовыми — экран выравнивает их вправо', () => {
    for (const column of FINANCE_COLUMNS) {
      const value = column.value(finance);
      const numeric = (typeof value === 'object' && value !== null) || typeof value === 'number';
      assert.equal(Boolean(column.numeric), numeric, column.key);
    }
  });
});

describe('выгрузка «Работ»', () => {
  it('сведения плашки, без денег', () => {
    assert.deepEqual(
      PROJECT_COLUMNS.map((column) => column.head),
      ['Код', 'Работа', 'Вид сопровождения', 'Клиент', 'Состояние', 'Срок работы', 'Этапы', 'Ждёт клиента', 'Менеджер', 'Куратор'],
    );
    for (const column of PROJECT_COLUMNS) {
      assert.notEqual(typeof column.value(project), 'object', column.key);
      assert.doesNotMatch(column.head, /договор|получено|маржа|начислено|сумм|оплат/iu);
    }
  });

  it('этапы «N из M», ожидание клиента и куратор без записи — по имени из книги заказов', () => {
    const [row] = sheetRows(PROJECT_COLUMNS, [project]);
    assert.equal(row![4], 'Действует');
    assert.equal(row![6], '2 из 4');
    assert.equal(row![7], 'да');
    assert.equal(row![9], 'Куратор К.');
    const bare = sheetRows(PROJECT_COLUMNS, [{ ...project, stages: [], serviceType: null, manager: null, expertNameRaw: null }])[0]!;
    assert.equal(bare[6], 'план не заведён');
    assert.equal(bare[7], 'нет');
    assert.equal(bare[2], '');
    assert.equal(bare[8], '');
    assert.equal(bare[9], '');
  });

  it('«Ждёт клиента» — только у действующей работы, как вкладка «Ждут клиента»', () => {
    for (const status of ['PAUSED', 'COMPLETED', 'CANCELLED'] as const) {
      const [row] = sheetRows(PROJECT_COLUMNS, [{ ...project, status }]);
      assert.equal(row![7], 'нет', status);
    }
    const [approval] = sheetRows(PROJECT_COLUMNS, [{ ...project, stages: [{ state: 'IN_APPROVAL' }] }]);
    assert.equal(approval![7], 'да');
  });
});
