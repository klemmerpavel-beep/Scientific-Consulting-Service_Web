/**
 * Разбор книги заказов.
 *
 * Настоящая книга содержит фамилии клиентов и суммы договоров, а репозиторий
 * сайта открыт, поэтому фикстурой она быть не может. Проверки идут по книге,
 * собранной сборщиком `tests/helpers/make-workbook.ts`: имена вымышлены, но
 * воспроизведены структура OOXML, заливка ячеек и все шесть классов дефектов
 * исходника. Совпадение контрольных сумм с настоящим файлом проверяется на
 * стенде и приводится в отчёте о спринте.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ISSUE_LABEL,
  classifyStatus,
  classifyType,
  findHeader,
  money,
  normalizeName,
  parseBook,
  parseDeadline,
  type IssueCode,
} from '../src/lib/cabinet/import/etl.ts';
import { readWorkbook } from '../src/lib/cabinet/import/xlsx.ts';
import { ImportError, unzip } from '../src/lib/cabinet/import/zip.ts';
import { excelSerial, makeWorkbook, zip, type TestRow } from './helpers/make-workbook.ts';

const GREEN = 'FF00B050';
const RED = 'FFFF0000';

const HEADER: TestRow = [
  'Дата',
  'Заказчик (ФИО)',
  'Тип работы',
  'Описание работы',
  'Дедлайн',
  'Стоимость',
  'Статутус работы',
  'Оплачено',
];

/**
 * Книга, повторяющая дефекты исходника: опечатки в типах работ, шесть
 * форматов срока, несуществующие даты, срок без года, переплата, закрытая
 * работа с остатком, однофамильцы и расхождение текста с заливкой.
 */
function book(): Buffer {
  const rows: TestRow[] = [
    HEADER,
    [
      excelSerial('2025-01-14'),
      'Иванов Иван Иванович',
      'Диссертция',
      'Кандидатская, физика',
      excelSerial('2025-06-01'),
      '150000',
      { value: 'закрыт', fill: GREEN },
      '150000',
    ],
    [
      excelSerial('2025-02-03'),
      'Иванов Иван Иванович',
      'Аспирнтура',
      'Пакет поступления',
      '31.04.2025',
      '90000',
      { value: 'в работе', fill: GREEN },
      '40000',
    ],
    [
      excelSerial('2025-03-11'),
      'Петрова Анна Сергеевна',
      'Статья ВАК',
      'Обзорная статья',
      '31 апреля 2025',
      '25000',
      { value: 'закрыт', fill: GREEN },
      '30000',
    ],
    [
      excelSerial('2025-11-02'),
      'Петрова Анна Сергеевна',
      'Отчет НИР',
      'Отчёт по этапу',
      '18 декабря',
      '60000',
      { value: 'закрыт', fill: GREEN },
      '20000',
    ],
    [
      excelSerial('2025-04-07'),
      'Сидоров Пётр Петрович',
      'Консультационное сопровождение до защиты',
      'Сопровождение',
      'к лету',
      '200000',
      { value: 'закрыт', fill: RED },
      '50000',
    ],
    [
      excelSerial('2025-05-19'),
      'Кузнецова Мария',
      'Дипломная работа',
      'Специалитет',
      '20.12.2025',
      '35000',
      { value: 'на старте', fill: null },
      '0',
    ],
  ];
  return makeWorkbook(rows);
}

function parsed() {
  return parseBook(readWorkbook(book()));
}

describe('архив и книга', () => {
  it('собранная книга читается как настоящий OOXML', () => {
    const files = unzip(book());
    assert.ok(files.has('xl/workbook.xml'));
    assert.ok(files.has('xl/worksheets/sheet1.xml'));
    assert.ok(files.has('xl/styles.xml'));
  });

  it('не архив отклоняется с понятным кодом', () => {
    assert.throws(
      () => unzip(Buffer.from('это не книга, а текст', 'utf8')),
      (error: unknown) => error instanceof ImportError && error.code === 'NOT_ZIP',
    );
  });

  it('пустой файл отклоняется', () => {
    assert.throws(
      () => unzip(Buffer.alloc(0)),
      (error: unknown) => error instanceof ImportError && error.code === 'EMPTY',
    );
  });

  it('заливка ячейки доходит до разбора', () => {
    const [sheet] = readWorkbook(book());
    const row = sheet.rows.find((candidate) => candidate.number === 6);
    assert.ok(row !== undefined);
    assert.equal(row.cells.G?.fill, RED);
  });
});

describe('строка заголовка', () => {
  it('находится и сопоставляется с колонками', () => {
    const [sheet] = readWorkbook(book());
    const { row, columns } = findHeader(sheet);
    assert.equal(row, 1);
    assert.equal(columns.date, 'A');
    assert.equal(columns.customer, 'B');
    assert.equal(columns.type, 'C');
    assert.equal(columns.deadline, 'E');
    assert.equal(columns.cost, 'F');
    // «Статутус» — опечатка исходной книги, она обязана распознаваться.
    assert.equal(columns.status, 'G');
    assert.equal(columns.paid, 'H');
  });

  it('находится и при пустых строках сверху', () => {
    const shifted = makeWorkbook([
      [''],
      [''],
      HEADER,
      [
        excelSerial('2025-01-14'),
        'Иванов Иван Иванович',
        'Диссертация',
        'Тема',
        excelSerial('2025-06-01'),
        '150000',
        'закрыт',
        '150000',
      ],
    ]);
    const [sheet] = readWorkbook(shifted);
    assert.equal(findHeader(sheet).row, 3);
    assert.equal(parseBook(readWorkbook(shifted)).rows.length, 1);
  });

  it('книга без заголовка отклоняется', () => {
    const headless = makeWorkbook([['раз', 'два', 'три']]);
    assert.throws(
      () => parseBook(readWorkbook(headless)),
      (error: unknown) => error instanceof ImportError && error.code === 'EMPTY_HEADER',
    );
  });
});

describe('свод типа работы', () => {
  const cases: [string, string | null][] = [
    ['Диссертция', 'dissertation'],
    ['Докторская Диссертаци', 'dissertation'],
    ['Аспирнтура', 'postgrad'],
    ['Пакет аспирантуры', 'postgrad'],
    ['Консультационное сопровождение до защиты', 'consulting'],
    ['Отчет НИР', 'research'],
    ['Презентаци по Отчету НИР', 'research'],
    ['Статья ВАК', 'article'],
    ['Дипломная работа', 'diploma'],
    ['', null],
  ];
  for (const [raw, expected] of cases) {
    it(`«${raw}» → ${expected ?? 'не сведено'}`, () => {
      assert.equal(classifyType(raw), expected);
    });
  }

  it('частное правило идёт раньше общего', () => {
    // «Аспирантура» содержит слово «диссертационный» в описании курса, но
    // относится к другой позиции справочника.
    assert.equal(classifyType('Аспирантура, диссертационный совет'), 'postgrad');
  });
});

describe('разбор срока', () => {
  const order = new Date(Date.UTC(2025, 10, 2));

  it('серийное число Excel', () => {
    const result = parseDeadline(excelSerial('2025-06-01'), order);
    assert.equal(result.date?.toISOString().slice(0, 10), '2025-06-01');
    assert.equal(result.issues.length, 0);
  });

  it('точечная запись', () => {
    assert.equal(
      parseDeadline('20.12.2025', order).date?.toISOString().slice(0, 10),
      '2025-12-20',
    );
  });

  it('русский текст с годом', () => {
    assert.equal(
      parseDeadline('16 декабря 2025 г.', order).date?.toISOString().slice(0, 10),
      '2025-12-16',
    );
  });

  it('несуществующая дата относится на последний день месяца', () => {
    for (const raw of ['31.04.2025', '31 апреля 2025']) {
      const result = parseDeadline(raw, order);
      assert.equal(result.date?.toISOString().slice(0, 10), '2025-04-30');
      assert.deepEqual(
        result.issues.map((issue) => issue.code),
        ['NONEXISTENT_DATE'],
      );
    }
  });

  it('срок без года берёт год заказа', () => {
    const result = parseDeadline('18 декабря', order);
    assert.equal(result.date?.toISOString().slice(0, 10), '2025-12-18');
    assert.deepEqual(
      result.issues.map((issue) => issue.code),
      ['DEADLINE_WITHOUT_YEAR'],
    );
  });

  it('срок без года, оказавшийся раньше заказа, переносится на следующий год', () => {
    const result = parseDeadline('16 января', order);
    assert.equal(result.date?.toISOString().slice(0, 10), '2026-01-16');
  });

  it('свободный текст остаётся неразобранным', () => {
    const result = parseDeadline('к лету', order);
    assert.equal(result.date, null);
    assert.deepEqual(
      result.issues.map((issue) => issue.code),
      ['UNPARSED_DEADLINE'],
    );
  });

  it('пустая ячейка замечанием не считается', () => {
    assert.deepEqual(parseDeadline('   ', order), { date: null, issues: [] });
  });
});

describe('состояние работы: заливка ведёт, текст — при её отсутствии', () => {
  // Решение Р-216: заливка — рабочая разметка заказчика. Текст «в работе»
  // остаётся в строке и после сдачи, поэтому ведущим признаком он быть не
  // может; расхождение по-прежнему выводится на разбор.
  const YELLOW = 'FFFFFF00';
  const BLUE = 'FF00B0F0';

  it('зелёная заливка закрывает работу, расхождение с текстом отмечается', () => {
    assert.deepEqual(classifyStatus('в работе', GREEN), { status: 'CLOSED', conflict: true });
  });

  it('зелёная заливка при согласном тексте расхождения не даёт', () => {
    assert.deepEqual(classifyStatus('закрыт', GREEN), { status: 'CLOSED', conflict: false });
  });

  it('зелёная заливка без разобранного текста читается как закрытая работа', () => {
    assert.deepEqual(classifyStatus('', GREEN), { status: 'CLOSED', conflict: false });
  });

  it('жёлтая заливка — работа идёт, даже когда в тексте «черновик готов»', () => {
    assert.deepEqual(classifyStatus('черновик готов', YELLOW), { status: 'IN_WORK', conflict: true });
    assert.deepEqual(classifyStatus('В работе', YELLOW), { status: 'IN_WORK', conflict: false });
  });

  it('голубая заливка — работа на старте', () => {
    assert.deepEqual(classifyStatus('На старте', BLUE), { status: 'ON_START', conflict: false });
  });

  it('красная заливка перекрывает текст и даёт расхождение', () => {
    assert.deepEqual(classifyStatus('закрыт', RED), { status: 'STOPPED', conflict: true });
  });

  it('красная заливка при согласном тексте расхождения не даёт', () => {
    assert.deepEqual(classifyStatus('остановлен', RED), { status: 'STOPPED', conflict: false });
  });

  it('без заливки и при цвете вне таблицы решает текст', () => {
    assert.deepEqual(classifyStatus('в работе', null), { status: 'IN_WORK', conflict: false });
    assert.deepEqual(classifyStatus('готово', 'FF7030A0'), { status: 'CLOSED', conflict: false });
  });

  it('таблица заливок из справочника перекрывает таблицу по умолчанию', () => {
    assert.deepEqual(classifyStatus('', 'FF7030A0', { FF7030A0: 'STOPPED' }), {
      status: 'STOPPED',
      conflict: false,
    });
  });

  it('неразобранный текст без заливки считается работой в процессе', () => {
    assert.deepEqual(classifyStatus('?', null), { status: 'IN_WORK', conflict: false });
  });
});

describe('книга целиком', () => {
  it('содержательные строки отделены от заголовка', () => {
    assert.equal(parsed().rows.length, 6);
  });

  it('контрольные суммы считаются по колонкам, а не по заливке', () => {
    const { totals } = parsed();
    assert.equal(totals.cost, 56_000_000n); // 560 000 ₽
    assert.equal(totals.paid, 29_000_000n); // 290 000 ₽
  });

  it('все классы замечаний представлены поимённо', () => {
    const { issueCounts } = parsed();
    const expected: Record<IssueCode, number> = {
      UNKNOWN_SUPPORT_TYPE: 0,
      UNPARSED_DEADLINE: 1,
      NONEXISTENT_DATE: 2,
      DEADLINE_WITHOUT_YEAR: 1,
      PAYMENT_EXCEEDS_CONTRACT: 1,
      // Зелёная строка «в работе» с остатком закрывается заливкой и
      // даёт второе замечание об остатке (решение Р-216).
      CLOSED_WITH_OUTSTANDING_BALANCE: 2,
      DUPLICATE_CLIENT_BY_NAME: 4,
      STATUS_FILL_CONFLICT: 2,
      AMOUNT_UNREADABLE: 0,
    };
    assert.deepEqual(issueCounts, expected);
  });

  it('у каждого класса есть человекочитаемое название', () => {
    for (const code of Object.keys(parsed().issueCounts) as IssueCode[]) {
      assert.equal(typeof ISSUE_LABEL[code], 'string');
      assert.ok(ISSUE_LABEL[code].length > 0);
    }
  });

  it('нераспознанный тип называет строку и написание', () => {
    const unknown = makeWorkbook([
      HEADER,
      [
        excelSerial('2025-01-14'),
        'Иванов Иван Иванович',
        'Сопроводительное письмо в редакцию',
        'Письмо',
        excelSerial('2025-02-01'),
        '5000',
        'закрыт',
        '5000',
      ],
    ]);
    const { rows } = parseBook(readWorkbook(unknown));
    assert.equal(rows[0]?.rowNumber, 2);
    assert.equal(rows[0]?.typeCode, null);
    assert.equal(rows[0]?.issues[0]?.code, 'UNKNOWN_SUPPORT_TYPE');
  });

  it('расхождение «цвет против текста» выведено отдельным перечнем', () => {
    const { conflicts } = parsed();
    // Строка 3: зелёная заливка при статусе «в работе» — та самая ошибка,
    // из-за которой доверие цвету дало бы 46 закрытых работ вместо 37.
    // Строка 6: красная заливка при статусе «закрыт».
    assert.deepEqual(
      conflicts.map((conflict) => [conflict.rowNumber, conflict.text, conflict.fill]),
      [
        [3, 'в работе', GREEN],
        [6, 'закрыт', RED],
      ],
    );
  });

  it('состояние при расхождении берётся по заливке, а не по тексту', () => {
    const rows = parsed().rows;
    // Зелёная строка «в работе» закрыта: текст остаётся после сдачи
    // (решение Р-216).
    assert.equal(rows.find((row) => row.rowNumber === 3)?.status, 'CLOSED');
    assert.equal(rows.find((row) => row.rowNumber === 6)?.status, 'STOPPED');
  });

  it('переплата помечена как ошибка, а не предупреждение', () => {
    const row = parsed().rows.find((candidate) => candidate.rowNumber === 4);
    const issue = row?.issues.find((candidate) => candidate.code === 'PAYMENT_EXCEEDS_CONTRACT');
    assert.equal(issue?.severity, 'ERROR');
  });

  it('закрытая работа с остатком помечена предупреждением', () => {
    const row = parsed().rows.find((candidate) => candidate.rowNumber === 5);
    assert.ok(
      row?.issues.some((issue) => issue.code === 'CLOSED_WITH_OUTSTANDING_BALANCE'),
      'строка с остатком 40 000 ₽ должна нести замечание',
    );
  });

  it('однофамильцы выявляются по всей книге, а не в пределах строки', () => {
    const rows = parsed().rows.filter((row) =>
      row.issues.some((issue) => issue.code === 'DUPLICATE_CLIENT_BY_NAME'),
    );
    assert.equal(rows.length, 4);
    for (const row of rows) {
      assert.match(row.normalizedName, /иванов|петрова/u);
    }
  });
});

describe('приведение ФИО', () => {
  it('разнобой написания сводится к одному виду', () => {
    const forms = ['Иванов И. И.', 'Иванов  И.И.', 'иванов и.  и.'];
    const normalized = new Set(forms.map(normalizeName));
    assert.equal(normalized.size, 1);
  });

  it('буква ё не разводит одного человека на двоих', () => {
    assert.equal(normalizeName('Пётр Семёнов'), normalizeName('Петр Семенов'));
  });
});

describe('естественный ключ строки', () => {
  it('устойчив между разборами одного файла', () => {
    const first = parsed().rows.map((row) => row.signature);
    const second = parsed().rows.map((row) => row.signature);
    assert.deepEqual(first, second);
  });

  it('уникален в пределах книги', () => {
    const signatures = parsed().rows.map((row) => row.signature);
    assert.equal(new Set(signatures).size, signatures.length);
  });

  it('различает заказы, совпадающие всем, кроме написания типа работы', () => {
    // Строки 47 и 48 настоящей книги: один клиент, одна дата, одна сумма,
    // «Отчет НИР» и «Презентаци по Отчету НИР». Обе сводятся к позиции
    // «НИР и отчёты», но это два разных заказа.
    const twins = makeWorkbook([
      HEADER,
      [
        excelSerial('2025-09-01'),
        'Кузнецова Мария',
        'Отчет НИР',
        'Отчёт',
        excelSerial('2025-10-01'),
        '40000',
        'закрыт',
        '40000',
      ],
      [
        excelSerial('2025-09-01'),
        'Кузнецова Мария',
        'Презентаци по Отчету НИР',
        'Презентация',
        excelSerial('2025-10-01'),
        '40000',
        'закрыт',
        '40000',
      ],
    ]);
    const { rows } = parseBook(readWorkbook(twins));
    assert.equal(rows[0]?.typeCode, rows[1]?.typeCode);
    assert.notEqual(rows[0]?.signature, rows[1]?.signature);
  });

  it('полностью совпадающие строки различаются номером повтора', () => {
    const repeat: TestRow = [
      excelSerial('2025-09-01'),
      'Кузнецова Мария',
      'Отчет НИР',
      'Отчёт',
      excelSerial('2025-10-01'),
      '40000',
      'закрыт',
      '40000',
    ];
    const { rows } = parseBook(readWorkbook(makeWorkbook([HEADER, repeat, repeat])));
    assert.equal(rows.length, 2);
    assert.notEqual(rows[0]?.signature, rows[1]?.signature);
    assert.match(rows[1]?.signature ?? '', /\|#2$/u);
  });
});

describe('суммы книги', () => {
  // Прежде нечитаемое молча становилось нулём, а «150.000» — ста
  // пятьюдесятью рублями (решение Р-233).
  const cases: [string, bigint | null][] = [
    ['150000', 15_000_000n],
    ['150 000 р.', 15_000_000n],
    ['150\u00a0000 ₽', 15_000_000n],
    ['150.000', 15_000_000n],
    ['1,234,567', 123_456_700n],
    ['150,50', 15_050n],
    ['35000.00', 3_500_000n],
    ['', 0n],
    ['#VALUE!', null],
    ['150 000 р. + 20 000 р.', null],
    ['договорная', null],
  ];
  for (const [raw, expected] of cases) {
    it(`«${raw}» → ${expected === null ? 'не читается' : expected}`, () => {
      assert.equal(money(raw), expected);
    });
  }
});

describe('архив книги', () => {
  // Сжатый в сотни килобайт архив разворачивался бы в гигабайты: предел
  // распакованного объёма держит память сервера (решение Р-239).
  it('архив, раздувающийся при распаковке, отклоняется', () => {
    const bomb = zip([{ name: 'xl/worksheets/sheet1.xml', content: Buffer.alloc(80 * 1024 * 1024) }]);
    assert.ok(bomb.length < 1024 * 1024, 'проверочный архив не сжался');
    assert.throws(() => unzip(bomb), (error: unknown) => {
      assert.ok(error instanceof ImportError);
      assert.match(error.message, /больше допустимого/u);
      return true;
    });
  });

  it('повреждённое сжатие называется повреждением, а не размером', () => {
    const good = zip([{ name: 'a.xml', content: 'x'.repeat(1000) }]);
    const broken = Buffer.from(good);
    // Портится начало сжатых данных, заголовки остаются целыми.
    broken[30 + 'a.xml'.length] = 0xff;
    broken[31 + 'a.xml'.length] = 0xff;
    assert.throws(() => unzip(broken), /Повреждённый архив/u);
  });
});
