import { ImportError, unzip } from './zip.ts';

/**
 * Разбор книги Excel (OOXML, ECMA-376: §18.3 листы, §18.8 стили).
 *
 * Возвращает ячейки со значением, типом и цветом заливки. Заливка —
 * не украшение: в исходной книге заказов ею размечено состояние работы, и
 * без неё две строки из пятидесяти пяти теряют единственный признак того,
 * что работа остановлена.
 *
 * Разбор ведётся регулярными выражениями по тем же образцам, что в соседнем
 * проекте панели. Полноценный разбор XML здесь избыточен: структура файла
 * задана стандартом, а объём — десятки килобайт.
 */

export interface Cell {
  /** Значение как строка: разбор числа и даты — забота следующего слоя. */
  readonly value: string;
  /** Тип из ECMA-376: `s` — общая строка, `n` — число, и так далее. */
  readonly type: string;
  /** Цвет заливки в виде `FF00B050`, либо `null`, если заливки нет. */
  readonly fill: string | null;
}

export interface Row {
  readonly number: number;
  readonly cells: Record<string, Cell>;
}

export interface Sheet {
  readonly name: string;
  readonly rows: readonly Row[];
}

function unescapeXml(text: string): string {
  if (!text.includes('&')) return text;
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function parseSharedStrings(xml: string | null): string[] {
  if (xml === null) return [];
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((match) => {
    let text = '';
    for (const run of match[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) text += unescapeXml(run[1]);
    return text;
  });
}

interface Styles {
  /** Цвет по номеру заливки. */
  readonly fills: (string | null)[];
  /** Номер заливки по номеру стиля ячейки. */
  readonly fillOfStyle: number[];
}

function parseStyles(xml: string | null): Styles {
  const fills: (string | null)[] = [];
  const fillOfStyle: number[] = [];
  if (xml === null) return { fills, fillOfStyle };

  const fillsBlock = xml.match(/<fills[^>]*>([\s\S]*?)<\/fills>/);
  if (fillsBlock !== null) {
    for (const fill of fillsBlock[1].matchAll(/<fill>([\s\S]*?)<\/fill>/g)) {
      const pattern = fill[1].match(/<patternFill[^>]*patternType="([^"]+)"/);
      const color = fill[1].match(/<fgColor[^>]*\brgb="([0-9A-Fa-f]{8})"/);
      // Учитывается только сплошная заливка: узор цветом состояния не является.
      fills.push(pattern?.[1] === 'solid' && color !== null ? color[1].toUpperCase() : null);
    }
  }

  const xfsBlock = xml.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/);
  if (xfsBlock !== null) {
    for (const xf of xfsBlock[1].matchAll(/<xf\b[^>]*?\/?>/g)) {
      const id = xf[0].match(/fillId="(\d+)"/);
      fillOfStyle.push(id === null ? 0 : Number(id[1]));
    }
  }

  return { fills, fillOfStyle };
}

function fillOf(styleIndex: number | null, styles: Styles): string | null {
  if (styleIndex === null) return null;
  const fillId = styles.fillOfStyle[styleIndex];
  if (fillId === undefined) return null;
  return styles.fills[fillId] ?? null;
}

function parseSheet(xml: string, shared: string[], styles: Styles): Row[] {
  const rows: Row[] = [];
  for (const row of xml.matchAll(/<row\b[^>]*\br="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: Record<string, Cell> = {};
    const cellPattern = /<c\b\s+r="([A-Z]+)\d+"((?:\s+[a-z]+="[^"]*")*)\s*(?:\/>|>([\s\S]*?)<\/c>)/g;
    for (const cell of row[2].matchAll(cellPattern)) {
      const attributes = cell[2] ?? '';
      const inner = cell[3] ?? '';
      const styleMatch = attributes.match(/\bs="(\d+)"/);
      const typeMatch = attributes.match(/\bt="([^"]+)"/);
      const style = styleMatch === null ? null : Number(styleMatch[1]);
      const type = typeMatch?.[1] ?? 'n';

      let value: string;
      if (type === 'inlineStr') {
        value = unescapeXml(inner.match(/<t[^>]*>([\s\S]*?)<\/t>/)?.[1] ?? '');
      } else {
        const raw = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? '';
        if (type === 's') value = shared[Number(raw)] ?? '';
        else if (type === 'str') value = unescapeXml(raw);
        else value = raw;
      }

      cells[cell[1]] = { value, type, fill: fillOf(style, styles) };
    }
    rows.push({ number: Number(row[1]), cells });
  }
  return rows;
}

export function readWorkbook(bytes: Buffer): Sheet[] {
  const files = unzip(bytes);
  const text = (name: string) => files.get(name)?.toString('utf8') ?? null;

  const workbook = text('xl/workbook.xml');
  if (workbook === null) {
    throw new ImportError(
      'NOT_XLSX',
      'Это архив, но не книга Excel: внутри нет xl/workbook.xml.',
    );
  }

  // Лист связан с файлом через идентификатор отношения; порядок атрибутов
  // в файле отношений стандартом не закреплён, поэтому разбираются оба.
  const relations = text('xl/_rels/workbook.xml.rels') ?? '';
  const target = new Map<string, string>();
  const clean = (path: string) => path.replace(/^\/?xl\//, '').replace(/^\//, '');
  for (const rel of relations.matchAll(/<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)) {
    target.set(rel[1], clean(rel[2]));
  }
  for (const rel of relations.matchAll(/<Relationship\b[^>]*Target="([^"]+)"[^>]*Id="([^"]+)"/g)) {
    if (!target.has(rel[2])) target.set(rel[2], clean(rel[1]));
  }

  const shared = parseSharedStrings(text('xl/sharedStrings.xml'));
  const styles = parseStyles(text('xl/styles.xml'));

  const sheets: Sheet[] = [];
  for (const sheet of workbook.matchAll(/<sheet\b[^>]*\/>/g)) {
    const name = unescapeXml(sheet[0].match(/name="([^"]*)"/)?.[1] ?? `Лист${sheets.length + 1}`);
    const id = sheet[0].match(/r:id="([^"]+)"/)?.[1] ?? null;
    const path = id === null ? null : target.get(id);
    const xml = path === undefined || path === null ? null : text(`xl/${path}`);
    sheets.push({ name, rows: xml === null ? [] : parseSheet(xml, shared, styles) });
  }
  return sheets;
}

export { ImportError } from './zip.ts';
