/**
 * Чтение документа для разбора: `.docx` и `.xlsx` → поток строк (решение
 * Р-557).
 *
 * Без сторонних библиотек (CONTRIBUTING, п. 5): архив — `unzip` переноса
 * книги заказов с его пределами против архива-бомбы (Р-239), книга Excel —
 * `readWorkbook`, документ Word — разбор `word/document.xml` здесь.
 *
 * Строка потока — абзац документа или строка таблицы. У строки таблицы из
 * двух ячеек есть `cells`: первая — метка, вторая — значение. Текст абзаца
 * — склейка всех `w:t`: Word дробит текст на фрагменты по правке и
 * оформлению, и «Тема работы» в файле может оказаться тремя кусками.
 */

import { readWorkbook } from '../import/xlsx.ts';
import { ImportError, unzip } from '../import/zip.ts';

export interface BriefLine {
  readonly text: string;
  /** Строка таблицы из двух ячеек: метка и значение. */
  readonly cells?: readonly [string, string];
}

export type BriefFormat = 'docx' | 'xlsx';

/** Отказ разбора с причиной для человека. */
export class BriefError extends Error {}

/** Предел файла документа: анкета и исходные данные весят десятки килобайт. */
export const BRIEF_MAX_BYTES = 2 * 1024 * 1024;

function unescapeXml(text: string): string {
  if (!text.includes('&')) return text;
  return text
    .replace(/&#x([0-9a-fA-F]+);/gu, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/gu, (_, dec: string) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&quot;/gu, '"')
    .replace(/&apos;/gu, "'")
    .replace(/&amp;/gu, '&');
}

/**
 * Текст абзаца: фрагменты `w:t`; табуляция — пробелом, разрыв строки
 * (Shift + Enter) — переводом строки. В образце владельца пункты плана
 * «3.5» и «3.6» стоят в одном абзаце через разрыв строки: на экране Word
 * это две строки, и разбор видит их так же.
 */
function paragraphText(xml: string): string {
  let out = '';
  const re = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:(tab|br|cr)\b[^>]*\/>/gu;
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml)) !== null) out += match[1] !== undefined ? unescapeXml(match[1]) : match[2] === 'tab' ? ' ' : '\n';
  return out
    .split('\n')
    .map((line) => line.replace(/\s+/gu, ' ').trim())
    .filter((line) => line !== '')
    .join('\n');
}

/** Конец элемента с учётом вложенности одноимённых: таблица в таблице. */
function closing(xml: string, from: number, tag: string): number {
  const open = new RegExp(`<${tag}[\\s>]`, 'gu');
  const close = `</${tag}>`;
  let depth = 1;
  let at = from;
  while (depth > 0) {
    open.lastIndex = at;
    const next = open.exec(xml);
    const end = xml.indexOf(close, at);
    if (end < 0) return xml.length;
    if (next !== null && next.index < end) {
      depth += 1;
      at = next.index + tag.length + 1;
    } else {
      depth -= 1;
      at = end + close.length;
    }
  }
  return at;
}

/** Ячейки строки таблицы: абзацы ячейки — через перевод строки. */
function rowCells(rowXml: string): string[] {
  const cells: string[] = [];
  let at = 0;
  for (;;) {
    const start = rowXml.slice(at).search(/<w:tc[\s>]/u);
    if (start < 0) break;
    const begin = at + start;
    const end = closing(rowXml, begin + 5, 'w:tc');
    const cell = rowXml.slice(begin, end);
    const paragraphs = cell.match(/<w:p[\s>][\s\S]*?<\/w:p>/gu) ?? [];
    cells.push(paragraphs.map(paragraphText).filter((text) => text !== '').join('\n'));
    at = end;
  }
  return cells;
}

function tableLines(tableXml: string): BriefLine[] {
  const lines: BriefLine[] = [];
  let at = 0;
  for (;;) {
    const start = tableXml.slice(at).search(/<w:tr[\s>]/u);
    if (start < 0) break;
    const begin = at + start;
    const end = closing(tableXml, begin + 5, 'w:tr');
    const cells = rowCells(tableXml.slice(begin, end)).map((cell) => cell.trim());
    at = end;
    if (cells.every((cell) => cell === '')) continue;
    // Строка «метка — значение»: две ячейки. Таблица данных (результаты
    // расчёта) — строкой текста, без метки.
    lines.push(
      cells.length === 2 ? { text: `${cells[0]}: ${cells[1]}`, cells: [cells[0]!, cells[1]!] } : { text: cells.join(' | ') },
    );
  }
  return lines;
}

/** Абзацы и строки таблиц `word/document.xml` в порядке документа. */
export function docxLines(documentXml: string): BriefLine[] {
  const body = documentXml.match(/<w:body[\s>]([\s\S]*)<\/w:body>/u)?.[1] ?? documentXml;
  const lines: BriefLine[] = [];
  const next = /<w:tbl[\s>]|<w:p[\s>]/gu;
  let match: RegExpExecArray | null;
  while ((match = next.exec(body)) !== null) {
    if (match[0].startsWith('<w:tbl')) {
      const end = closing(body, match.index + 6, 'w:tbl');
      lines.push(...tableLines(body.slice(match.index, end)));
      next.lastIndex = end;
    } else {
      // Пустой абзац `<w:p/>` закрывается сам.
      const selfClosed = body.slice(match.index, body.indexOf('>', match.index) + 1).endsWith('/>');
      if (selfClosed) continue;
      const end = body.indexOf('</w:p>', match.index);
      if (end < 0) break;
      // Абзац с разрывами строки — несколько строк потока.
      for (const text of paragraphText(body.slice(match.index, end)).split('\n')) if (text !== '') lines.push({ text });
      next.lastIndex = end + 6;
    }
  }
  return lines;
}

/** Первый лист книги: колонки A и B — метка и значение. */
function xlsxLines(bytes: Buffer): BriefLine[] {
  const sheet = readWorkbook(bytes)[0];
  if (sheet === undefined) return [];
  const lines: BriefLine[] = [];
  for (const row of sheet.rows) {
    const label = (row.cells.A?.value ?? '').trim();
    const value = (row.cells.B?.value ?? '').trim();
    if (label === '' && value === '') continue;
    lines.push({ text: `${label}: ${value}`, cells: [label, value] });
  }
  return lines;
}

/** Документ → строки. Не Word и не Excel, пустой или повреждённый — отказ с причиной. */
export function readBrief(bytes: Buffer): { format: BriefFormat; lines: BriefLine[] } {
  if (bytes.length === 0) throw new BriefError('Файл пуст.');
  if (bytes.length > BRIEF_MAX_BYTES) throw new BriefError('Файл больше 2 МБ: анкета и исходные данные столько не весят.');
  let entries: Map<string, Buffer>;
  try {
    entries = unzip(bytes);
  } catch (error) {
    if (error instanceof ImportError) throw new BriefError('Это не документ Word (.docx) и не книга Excel (.xlsx).');
    throw error;
  }
  const document = entries.get('word/document.xml');
  if (document !== undefined) {
    const lines = docxLines(document.toString('utf8'));
    if (lines.length === 0) throw new BriefError('В документе нет текста.');
    return { format: 'docx', lines };
  }
  if (entries.has('xl/workbook.xml')) {
    let lines: BriefLine[];
    try {
      lines = xlsxLines(bytes);
    } catch (error) {
      if (error instanceof ImportError) throw new BriefError('Книгу Excel не удалось прочитать: сохраните её заново как .xlsx.');
      throw error;
    }
    if (lines.length === 0) throw new BriefError('На первом листе книги нет строк.');
    return { format: 'xlsx', lines };
  }
  throw new BriefError('Это не документ Word (.docx) и не книга Excel (.xlsx).');
}
