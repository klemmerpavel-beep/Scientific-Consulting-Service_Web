import { crc32, deflateRawSync } from 'node:zlib';

/**
 * Книга Excel из одной таблицы — для зеркала на Диске (решение Р-260).
 *
 * Зачем XLSX рядом с CSV. Таблица CSV на Диске открывается просмотрщиком
 * как текст: суммы в ней — строки, заголовок уезжает при прокрутке,
 * фильтра нет. Книга Excel открывается Яндекс Документами и Excel как
 * настоящая таблица: суммы складываются, первая строка закреплена, у
 * столбцов фильтр. Руководитель сводит и считает на телефоне — ради этого
 * таблицы и выгружаются (см. `registry.ts`).
 *
 * Зачем свой писатель, а не библиотека: нужна одна страница с текстом и
 * числами. Ради неё не вводится зависимость на проекте, который принимает
 * персональные данные (CONTRIBUTING, правило 5). Формат — минимальный
 * OOXML: пять частей в архиве ZIP.
 *
 * Книга собирается детерминированно: время в архиве постоянное, порядок
 * частей постоянный. Та же таблица даёт тот же файл байт в байт, и зеркало
 * по свёртке понимает, что отправлять её снова не нужно.
 *
 * Формулы. В XLSX формула — отдельный элемент `<f>`; строковая ячейка
 * формулой не исполняется, что бы в ней ни стояло. Поэтому апостроф
 * против `=HYPERLINK(…)`, нужный CSV (Р-246), здесь не ставится: текст
 * заявки сохраняется как написан.
 */

/** Сумма в копейках: в книге — число с двумя знаками и разделителем разрядов. */
export interface Money {
  readonly kopecks: bigint;
}

export type XlsxCell = string | number | Money | null | undefined;

export interface XlsxSheet {
  /** Название листа: не длиннее 31 знака, без `[]:*?/\`. */
  readonly title: string;
  readonly head: readonly string[];
  readonly rows: readonly (readonly XlsxCell[])[];
}

/** Стили в порядке `cellXfs` в `styles.xml`. */
const STYLE = { plain: 0, head: 1, money: 2, integer: 3, text: 4 } as const;

/** Ограничение Excel на длину текста в ячейке. */
const CELL_LIMIT = 32_767;

export function isMoney(value: unknown): value is Money {
  return typeof value === 'object' && value !== null && typeof (value as Money).kopecks === 'bigint';
}

/**
 * Символы, недопустимые в XML 1.0, и одиночные суррогаты. Текст приходит
 * с открытой формы сайта: управляющий символ в сообщении сделал бы книгу
 * нечитаемой целиком.
 */
function clean(text: string): string {
  return text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '');
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Буквенное имя столбца: 0 → A, 25 → Z, 26 → AA. */
export function columnName(index: number): string {
  let n = index + 1;
  let name = '';
  while (n > 0) {
    const rest = (n - 1) % 26;
    name = String.fromCharCode(65 + rest) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

/** Копейки числом для `<v>`: без двоичной погрешности и без экспоненты. */
function moneyValue(kopecks: bigint): string {
  const negative = kopecks < 0n;
  const abs = negative ? -kopecks : kopecks;
  return `${negative ? '-' : ''}${abs / 100n}.${String(abs % 100n).padStart(2, '0')}`;
}

function textCell(ref: string, text: string, style: number): string {
  const value = escapeXml(clean(text).slice(0, CELL_LIMIT));
  return `<c r="${ref}" t="inlineStr" s="${style}"><is><t xml:space="preserve">${value}</t></is></c>`;
}

function cellXml(ref: string, value: XlsxCell): string {
  if (value === null || value === undefined || value === '') return '';
  if (isMoney(value)) return `<c r="${ref}" s="${STYLE.money}"><v>${moneyValue(value.kopecks)}</v></c>`;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '';
    const style = Number.isInteger(value) ? STYLE.integer : STYLE.plain;
    return `<c r="${ref}" s="${style}"><v>${value}</v></c>`;
  }
  return textCell(ref, value, STYLE.text);
}

/** Ширина столбца по самому длинному значению: не уже 8 и не шире 60 знаков. */
function widths(sheet: XlsxSheet): number[] {
  return sheet.head.map((title, i) => {
    let longest = title.length + 2;
    for (const row of sheet.rows) {
      const value = row[i];
      const shown = isMoney(value) ? moneyValue(value.kopecks).length + 4 : String(value ?? '').length;
      if (shown > longest) longest = shown;
    }
    return Math.min(60, Math.max(8, longest + 1));
  });
}

function sheetXml(sheet: XlsxSheet): string {
  const cols = widths(sheet)
    .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
    .join('');
  const head = sheet.head.map((title, i) => textCell(`${columnName(i)}1`, title, STYLE.head)).join('');
  const body = sheet.rows
    .map((row, r) => {
      const n = r + 2;
      const cells = row.map((value, c) => cellXml(`${columnName(c)}${n}`, value)).join('');
      return `<row r="${n}">${cells}</row>`;
    })
    .join('');
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<sheetViews><sheetView workbookViewId="0">' +
    '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' +
    '</sheetView></sheetViews>' +
    '<sheetFormatPr defaultRowHeight="15"/>' +
    `<cols>${cols}</cols>` +
    `<sheetData><row r="1">${head}</row>${body}</sheetData>` +
    `<autoFilter ref="${filterRange(sheet, false)}"/>` +
    '</worksheet>'
  );
}

/** Название листа по правилам Excel. */
export function sheetTitle(title: string): string {
  const safe = title.replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 31);
  return safe.length === 0 ? 'Лист1' : safe;
}

const CONTENT_TYPES =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
  '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
  '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
  '</Types>';

const ROOT_RELS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
  '</Relationships>';

const WORKBOOK_RELS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
  '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
  '</Relationships>';

/**
 * Стили: обычная ячейка; заголовок — полужирный на тихом сером с нижней
 * линией; деньги — `# ##0,00`; целое — `# ##0`; текст — с переносом по
 * словам, чтобы длинное сообщение заявки не уходило за край столбца.
 */
const STYLES =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts>' +
  '<fonts count="2">' +
  '<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>' +
  '<font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font>' +
  '</fonts>' +
  '<fills count="3">' +
  '<fill><patternFill patternType="none"/></fill>' +
  '<fill><patternFill patternType="gray125"/></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FFF6F7F9"/><bgColor indexed="64"/></patternFill></fill>' +
  '</fills>' +
  '<borders count="2">' +
  '<border><left/><right/><top/><bottom/><diagonal/></border>' +
  '<border><left/><right/><top/><bottom style="thin"><color rgb="FFC4CAD4"/></bottom><diagonal/></border>' +
  '</borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="5">' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>' +
  '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' +
  '</cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  '</styleSheet>';

function workbookXml(title: string, range: string): string {
  const name = escapeXml(sheetTitle(title));
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    `<sheets><sheet name="${name}" sheetId="1" r:id="rId1"/></sheets>` +
    // Фильтр столбцов Excel хранит ещё и именованным диапазоном листа.
    `<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${name.replace(/'/g, "''")}'!${range}</definedName></definedNames>` +
    '</workbook>'
  );
}

/**
 * Архив ZIP со сжатием deflate. Время всех записей — 1 января 1980 года,
 * наименьшее, что умеет формат: так книга не меняется от часа сборки.
 */
function zip(entries: readonly (readonly [string, Buffer])[]): Buffer {
  const DOS_TIME = 0;
  const DOS_DATE = (0 << 9) | (1 << 5) | 1;
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, data] of entries) {
    const fileName = Buffer.from(name, 'utf8');
    const packed = deflateRawSync(data);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(fileName.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, fileName, packed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(fileName.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, fileName);
    offset += local.length + fileName.length + packed.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

/** Диапазон фильтра: заголовок и все строки. */
function filterRange(sheet: XlsxSheet, absolute: boolean): string {
  const last = columnName(Math.max(sheet.head.length, 1) - 1);
  const rows = sheet.rows.length + 1;
  return absolute ? `$A$1:$${last}$${rows}` : `A1:${last}${rows}`;
}

export function xlsx(sheet: XlsxSheet): Buffer {
  const utf8 = (text: string) => Buffer.from(text, 'utf8');
  return zip([
    ['[Content_Types].xml', utf8(CONTENT_TYPES)],
    ['_rels/.rels', utf8(ROOT_RELS)],
    ['xl/workbook.xml', utf8(workbookXml(sheet.title, filterRange(sheet, true)))],
    ['xl/_rels/workbook.xml.rels', utf8(WORKBOOK_RELS)],
    ['xl/styles.xml', utf8(STYLES)],
    ['xl/worksheets/sheet1.xml', utf8(sheetXml(sheet))],
  ]);
}
