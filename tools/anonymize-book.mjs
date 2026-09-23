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

// Разбор книги — тот же, что у переноса в кабинет (`previewBook`): прежде
// здесь жила своя копия правил, и она разошлась с переносом — теряла
// строки без даты заказа, не знала патента и НИОКР, а состояние брала по
// заливке, когда перенос брал его по тексту. Прототип обязан показывать
// ровно то, что получит кабинет после переноса той же книги (Р-216).
import { parseBook } from '../app/src/lib/cabinet/import/etl.ts';
import { readWorkbook } from '../app/src/lib/cabinet/import/xlsx.ts';

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

// ── Обезличивание ────────────────────────────────────────────────────────

/** Название позиции справочника по коду — для свода, а не для экрана. */
const TYPE_NAME = {
  postgrad: 'Сопровождение аспиранта',
  dissertation: 'Сопровождение диссертационного исследования',
  consulting: 'Научный консалтинг',
  research: 'НИР и отчётность',
  article: 'Научные публикации',
  diploma: 'Сопровождение выпускной квалификационной работы',
};

/** Обобщённая тема: предметная область без узнаваемых подробностей. */
const TOPIC_BY_TYPE = {
  postgrad: 'Реферативная часть и план исследования по направлению подготовки',
  dissertation: 'Диссертационное исследование по техническому направлению',
  consulting: 'Научное сопровождение прикладной разработки',
  research: 'Научно-исследовательская работа с отчётностью по этапам',
  article: 'Статья в рецензируемый журнал',
  diploma: 'Выпускная квалификационная работа по техническому направлению',
};

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

/** Состояние переноса → состояние свода: как `PROJECT_STATUS` в переносе. */
const STATE = { IN_WORK: 'ACTIVE', ON_START: 'ACTIVE', STOPPED: 'STOPPED', CLOSED: 'COMPLETED' };

const day = (date) => (date === null ? null : date.toISOString().slice(0, 10));
const rubles = (kopecks) => Math.round(Number(kopecks) / 100);

function main() {
  const book = parseBook(readWorkbook(readFileSync(source)));
  const nameOf = makeNamer();

  const orders = book.rows.map((row) => {
    const typeCode = row.typeCode ?? 'consulting';
    const state = STATE[row.status];
    return {
      orderedOn: day(row.orderDate),
      client: nameOf(row.customer),
      typeCode,
      typeName: TYPE_NAME[typeCode] ?? TYPE_NAME.consulting,
      topic: TOPIC_BY_TYPE[typeCode] ?? TOPIC_BY_TYPE.consulting,
      dueOn: day(row.deadline),
      cost: rubles(row.cost),
      paid: rubles(row.paid),
      state,
      statusRaw: state === 'ACTIVE' ? row.rawStatus : null,
    };
  });

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
