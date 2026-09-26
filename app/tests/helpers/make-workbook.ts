import { crc32, deflateRawSync } from 'node:zlib';

/**
 * Сборка книги Excel для проверок.
 *
 * Настоящая книга заказов содержит фамилии клиентов и суммы договоров, а
 * репозиторий сайта открыт. Поэтому проверки идут по книге, собранной здесь:
 * имена вымышлены, но воспроизведены и структура файла, и заливка ячеек, и
 * все дефекты исходника — иначе проверялся бы не разбор, а сам себя.
 *
 * Собирается минимальный, но настоящий OOXML: архив ZIP с `workbook.xml`,
 * `styles.xml`, `sharedStrings.xml` и листом.
 */

export interface TestCell {
  readonly value: string;
  /** Цвет заливки вида `FF00B050`, либо `null`. */
  readonly fill?: string | null;
}

export type TestRow = readonly (TestCell | string)[];

const COLUMNS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Один элемент архива в формате ZIP (APPNOTE.TXT §4.3). */
interface Entry {
  readonly name: string;
  readonly raw: Buffer;
  readonly deflated: Buffer;
}

/** Архив из произвольных файлов: нужен проверкам разбора архива. */
export function zip(files: readonly { name: string; content: string | Buffer }[]): Buffer {
  const entries: Entry[] = files.map((file) => {
    const raw = typeof file.content === 'string' ? Buffer.from(file.content, 'utf8') : file.content;
    return { name: file.name, raw, deflated: deflateRawSync(raw) };
  });

  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const checksum = crc32(entry.raw);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4); // требуемая версия
    localHeader.writeUInt16LE(8, 8); // метод: deflate
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(entry.deflated.length, 18);
    localHeader.writeUInt32LE(entry.raw.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    locals.push(localHeader, name, entry.deflated);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(entry.deflated.length, 20);
    centralHeader.writeUInt32LE(entry.raw.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt32LE(offset, 42);
    central.push(centralHeader, name);

    offset += 30 + name.length + entry.deflated.length;
  }

  const centralBuffer = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuffer.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...locals, centralBuffer, end]);
}

export function makeWorkbook(rows: readonly TestRow[], sheetName = 'Лист1'): Buffer {
  // Заливки: нулевая и первая заняты стандартом, свои идут следом.
  const palette: string[] = [];
  for (const row of rows) {
    for (const cell of row) {
      const fill = typeof cell === 'string' ? null : (cell.fill ?? null);
      if (fill !== null && !palette.includes(fill)) palette.push(fill);
    }
  }

  const fills =
    '<fills count="' +
    (2 + palette.length) +
    '"><fill><patternFill patternType="none"/></fill>' +
    '<fill><patternFill patternType="gray125"/></fill>' +
    palette
      .map((color) => `<fill><patternFill patternType="solid"><fgColor rgb="${color}"/></patternFill></fill>`)
      .join('') +
    '</fills>';

  const cellXfs =
    '<cellXfs count="' +
    (1 + palette.length) +
    '"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>' +
    palette.map((_, index) => `<xf numFmtId="0" fontId="0" fillId="${index + 2}" borderId="0" applyFill="1"/>`).join('') +
    '</cellXfs>';

  const styles =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<fonts count="1"><font><sz val="11"/></font></fonts>' +
    fills +
    '<borders count="1"><border/></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    cellXfs +
    '</styleSheet>';

  const shared: string[] = [];
  const indexOf = (text: string): number => {
    const found = shared.indexOf(text);
    if (found >= 0) return found;
    shared.push(text);
    return shared.length - 1;
  };

  const sheetRows = rows
    .map((row, rowIndex) => {
      const cells = row
        .map((cell, columnIndex) => {
          const value = typeof cell === 'string' ? cell : cell.value;
          if (value.length === 0) return '';
          const fill = typeof cell === 'string' ? null : (cell.fill ?? null);
          const style = fill === null ? '' : ` s="${palette.indexOf(fill) + 1}"`;
          const ref = `${COLUMNS[columnIndex]}${rowIndex + 1}`;
          // Числа пишутся числами, остальное — общими строками: так же
          // устроена и настоящая книга.
          if (/^\d+(\.\d+)?$/.test(value)) return `<c r="${ref}"${style}><v>${value}</v></c>`;
          return `<c r="${ref}"${style} t="s"><v>${indexOf(value)}</v></c>`;
        })
        .join('');
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join('');

  const sheet =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<sheetData>${sheetRows}</sheetData></worksheet>`;

  const sharedStrings =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${shared.length}" uniqueCount="${shared.length}">` +
    shared.map((text) => `<si><t>${escapeXml(text)}</t></si>`).join('') +
    '</sst>';

  return zip([
    {
      name: '[Content_Types].xml',
      content:
        '<?xml version="1.0" encoding="UTF-8"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="xml" ContentType="application/xml"/></Types>',
    },
    {
      name: 'xl/workbook.xml',
      content:
        '<?xml version="1.0" encoding="UTF-8"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        `<sheets><sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      content:
        '<?xml version="1.0" encoding="UTF-8"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
        '</Relationships>',
    },
    { name: 'xl/styles.xml', content: styles },
    { name: 'xl/sharedStrings.xml', content: sharedStrings },
    { name: 'xl/worksheets/sheet1.xml', content: sheet },
  ]);
}

/** Серийный номер даты в Excel: начало отсчёта — 30 декабря 1899 года. */
export function excelSerial(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  return String(Math.round((date.getTime() - Date.UTC(1899, 11, 30)) / 86_400_000));
}
