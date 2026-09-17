/**
 * Обезличивание книги заказов для прототипа.
 *
 * Прототип выложен по открытой ссылке. Настоящая книга содержит ФИО
 * заказчиков и темы работ — то и другое опознаваемо, и в открытый доступ
 * не попадает ни при каких условиях. Но показывать вымышленную практику
 * заказчику бессмысленно: ему нужно видеть свои заказы и свои деньги.
 *
 * Поэтому из книги берутся величины и состояния, а имена и темы
 * заменяются: заказчик — «Заказчик К.» по первой букве фамилии, тема —
 * обобщённой формулировкой по типу работы. Суммы, сроки, даты и
 * состояния остаются настоящими.
 *
 * Книга при этом остаётся вне репозитория; в репозиторий попадает только
 * обезличенный свод `app/scripts/data/book.json`.
 *
 * Запуск (из корня репозитория):
 *   node tools/anonymize-book.mjs /путь/к/книге.xlsx
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { inflateRawSync } from 'node:zlib';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'app', 'scripts', 'data', 'book.json');

const source = process.argv[2];
if (source === undefined) {
  console.error('Укажите путь к книге заказов: node tools/anonymize-book.mjs <файл.xlsx>');
  process.exit(1);
}
if (source.startsWith(ROOT)) {
  console.error('Книга заказов не должна лежать внутри репозитория: он открыт.');
  process.exit(1);
}

// ── Разбор контейнера ────────────────────────────────────────────────────

/** Записи ZIP по центральному каталогу: имя → содержимое. */
function unzip(buffer) {
  const end = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end < 0) throw new Error('Не найден конец центрального каталога');
  const count = buffer.readUInt16LE(end + 10);
  let offset = buffer.readUInt32LE(end + 16);

  const files = new Map();
  for (let index = 0; index < count; index += 1) {
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength);

    const method = buffer.readUInt16LE(localOffset + 8);
    const compressed = buffer.readUInt32LE(localOffset + 18);
    const localName = buffer.readUInt16LE(localOffset + 26);
    const localExtra = buffer.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localName + localExtra;
    const raw = buffer.subarray(start, start + compressed);

    files.set(name, method === 0 ? raw : inflateRawSync(raw));
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

const tag = (xml, name) => [...xml.matchAll(new RegExp(`<${name}\\b[^>]*>|<${name}\\b[^>]*/>`, 'gu'))];

/** Значения ячеек строки и цвет заливки статуса. */
function readSheet(sheetXml, shared, fillByStyle) {
  const rows = [];
  for (const row of sheetXml.split('<row ').slice(1)) {
    const cells = new Map();
    let statusFill = null;
    for (const cell of row.split('<c ').slice(1)) {
      const ref = /r="([A-Z]+)\d+"/u.exec(cell)?.[1];
      if (ref === undefined) continue;
      const style = /s="(\d+)"/u.exec(cell)?.[1];
      const type = /t="([^"]+)"/u.exec(cell)?.[1];
      const value = /<v>([^<]*)<\/v>/u.exec(cell)?.[1];
      const inline = /<is>([\s\S]*?)<\/is>/u.exec(cell)?.[1];

      let text = '';
      if (value !== undefined) text = type === 's' ? (shared[Number(value)] ?? '') : value;
      else if (inline !== undefined) text = [...inline.matchAll(/<t[^>]*>([^<]*)<\/t>/gu)].map((m) => m[1]).join('');

      cells.set(ref, text);
      if (ref === 'G' && style !== undefined) statusFill = fillByStyle[Number(style)] ?? null;
    }
    if (cells.size > 0) rows.push({ cells, statusFill });
  }
  return rows;
}

// ── Обезличивание ────────────────────────────────────────────────────────

/**
 * Свод типов работ к позициям справочника — тот же, что в переносе книги
 * (решение Р-133): тридцать написаний сводятся к шести позициям.
 */
const TYPE_RULES = [
  // текст-гуард: не текст интерфейса — свод написаний книги
  [/аспирант|семестр/iu, 'postgrad', 'Сопровождение аспиранта'],
  [/диссерт|докторск/iu, 'dissertation', 'Сопровождение диссертационного исследования'],
  [/консалтинг|сопровожд/iu, 'consulting', 'Научный консалтинг'],
  [/нир|отчет|отчёт|презентац/iu, 'research', 'НИР и отчётность'],
  [/стать|публикац|рерайт|обзорн/iu, 'article', 'Научные публикации'],
  [/диплом|специалитет|бакалавр|магистр/iu, 'diploma', 'Сопровождение выпускной квалификационной работы'],
];

/** Обобщённая тема: предметная область без узнаваемых подробностей. */
const TOPIC_BY_TYPE = {
  postgrad: 'Реферативная часть и план исследования по направлению подготовки',
  dissertation: 'Диссертационное исследование по техническому направлению',
  consulting: 'Научное сопровождение прикладной разработки',
  research: 'Научно-исследовательская работа с отчётностью по этапам',
  article: 'Статья в рецензируемый журнал',
  diploma: 'Выпускная квалификационная работа по техническому направлению',
};

function classifyType(raw) {
  for (const [pattern, code, name] of TYPE_RULES) {
    if (pattern.test(raw)) return { code, name };
  }
  return { code: 'consulting', name: 'Научный консалтинг' };
}

/**
 * Имя заказчика сводится к фамилии одной буквой.
 *
 * Полные инициалы вместе с суммой и сроком всё ещё сужают круг лиц до
 * одного человека, поэтому остаётся только первая буква и порядковый
 * номер в пределах буквы.
 */
function makeNamer() {
  const seen = new Map();
  const numbers = new Map();
  return (raw) => {
    const key = raw.trim().toLowerCase();
    if (seen.has(key)) return seen.get(key);
    const letter = (raw.trim()[0] ?? 'Н').toUpperCase();
    const next = (numbers.get(letter) ?? 0) + 1;
    numbers.set(letter, next);
    const name = next === 1 ? `Заказчик ${letter}.` : `Заказчик ${letter}.${next}`;
    seen.set(key, name);
    return name;
  };
}

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

function fromSerial(value) {
  const serial = Number(String(value).replace(',', '.'));
  if (!Number.isFinite(serial) || serial < 1) return null;
  return new Date(EXCEL_EPOCH + Math.trunc(serial) * 86_400_000).toISOString().slice(0, 10);
}

/** Срок: серийное число, «1 мая 2025» либо «31.12.2024». */
const MONTHS = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];

function parseDue(raw) {
  const text = String(raw ?? '').trim();
  if (text === '') return null;
  const serial = fromSerial(text);
  if (serial !== null) return serial;

  const words = /^(\d{1,2})\s+([а-яё]+)\s*(\d{4})?/iu.exec(text);
  if (words !== null) {
    const month = MONTHS.findIndex((name) => name.startsWith(words[2].slice(0, 4).toLowerCase()));
    if (month >= 0) {
      const year = words[3] ?? '2026';
      const day = Number(words[1]);
      const date = new Date(Date.UTC(Number(year), month, day));
      // Несуществующая дата («31 апреля») переносится на последний день месяца.
      if (date.getUTCMonth() !== month) date.setUTCDate(0);
      return date.toISOString().slice(0, 10);
    }
  }
  const dotted = /^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})/u.exec(text);
  if (dotted !== null) {
    const date = new Date(Date.UTC(Number(dotted[3]), Number(dotted[2]) - 1, Number(dotted[1])));
    if (date.getUTCMonth() !== Number(dotted[2]) - 1) date.setUTCDate(0);
    return date.toISOString().slice(0, 10);
  }
  return null;
}

const GREEN = 'FF00B050';
const YELLOW = 'FFFFFF00';
const RED = 'FFFF0000';

function main() {
  const files = unzip(readFileSync(source));
  const sharedXml = files.get('xl/sharedStrings.xml')?.toString('utf8') ?? '';
  const shared = [...sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/gu)].map((m) =>
    [...m[1].matchAll(/<t[^>]*>([^<]*)<\/t>/gu)].map((t) => t[1]).join(''),
  );

  const stylesXml = files.get('xl/styles.xml').toString('utf8');
  const fillColors = [...stylesXml.matchAll(/<fill>([\s\S]*?)<\/fill>/gu)].map(
    (m) => /<fgColor rgb="([0-9A-F]{8})"/u.exec(m[1])?.[1] ?? null,
  );
  const cellXfs = /<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/u.exec(stylesXml)[1];
  const fillByStyle = tag(cellXfs, 'xf').map((m) => fillColors[Number(/fillId="(\d+)"/u.exec(m[0])?.[1] ?? 0)] ?? null);

  const rows = readSheet(files.get('xl/worksheets/sheet1.xml').toString('utf8'), shared, fillByStyle);
  const nameOf = makeNamer();

  const orders = [];
  for (const { cells, statusFill } of rows) {
    const date = fromSerial(cells.get('A') ?? '');
    const client = (cells.get('B') ?? '').trim();
    if (date === null || client === '') continue;

    const type = classifyType(cells.get('C') ?? '');
    const cost = Math.round(Number(cells.get('F') ?? 0) || 0);
    const paid = Math.round(Number(cells.get('H') ?? 0) || 0);
    const status = (cells.get('G') ?? '').trim();

    // Действующие работы заказчик помечает в книге жёлтым. Текстовый статус
    // для этого не годится: «в работе» стоит и у закрытых заказов 2024 года.
    const state = statusFill === YELLOW ? 'ACTIVE' : statusFill === RED ? 'STOPPED' : 'COMPLETED';

    orders.push({
      orderedOn: date,
      client: nameOf(client),
      typeCode: type.code,
      typeName: type.name,
      topic: TOPIC_BY_TYPE[type.code],
      dueOn: parseDue(cells.get('E')),
      cost,
      paid,
      state,
      statusRaw: state === 'ACTIVE' ? status : null,
    });
  }

  const sum = (pick) => orders.reduce((acc, order) => acc + pick(order), 0);
  const active = orders.filter((order) => order.state === 'ACTIVE');

  mkdirSync(path.dirname(OUT), { recursive: true });
  writeFileSync(
    OUT,
    `${JSON.stringify(
      {
        note: 'Обезличенный свод книги заказов. Имена заменены, темы обобщены; суммы, сроки и состояния настоящие. Пересобирается tools/anonymize-book.mjs.',
        orders,
        totals: { orders: orders.length, cost: sum((o) => o.cost), paid: sum((o) => o.paid) },
      },
      null,
      2,
    )}\n`,
  );

  console.log(`Заказов: ${orders.length}, из них действующих: ${active.length}`);
  console.log(`Стоимость: ${sum((o) => o.cost).toLocaleString('ru-RU')} ₽`);
  console.log(`Оплачено: ${sum((o) => o.paid).toLocaleString('ru-RU')} ₽`);
  console.log(`Свод записан: app/scripts/data/book.json`);
}

main();
