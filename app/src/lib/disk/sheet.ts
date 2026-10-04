import { csv } from './table.ts';
import { xlsx, type XlsxCell } from './xlsx.ts';

/**
 * Таблица реестра в двух видах (решение Р-260). Книга Excel — для людей:
 * Яндекс Документы и Excel открывают её таблицей с закреплённым
 * заголовком, фильтром и суммами-числами. CSV — для учётных программ:
 * «1С» и выгрузки бухгалтера принимают его без преобразований.
 */
export interface Table {
  /** Имя книги Excel, по-русски: так её находят на телефоне. */
  readonly file: string;
  /** Имя CSV, латиницей: учётные программы не любят кириллицу в путях. */
  readonly name: string;
  readonly rows: number;
  readonly xlsx: Buffer;
  readonly csv: string;
  /** Заголовок и строки — чтобы собрать обезличенную копию (решение Р-265). */
  readonly head: readonly string[];
  readonly data: readonly (readonly XlsxCell[])[];
}

export function table(
  file: string,
  name: string,
  head: readonly string[],
  rows: readonly (readonly XlsxCell[])[],
): Table {
  const title = file.replace(/\.xlsx$/, '');
  return {
    file,
    name,
    rows: rows.length,
    xlsx: xlsx({ title, head, rows }),
    csv: csv(head, rows),
    head,
    data: rows,
  };
}

/**
 * Столбцы, по которым человека можно узнать: имя, контакт, организация,
 * тема работы, свободный текст заявки и отзыва, клиент и сотрудники, имя
 * файла материала. Тема диссертации в сочетании с вузом опознаёт автора
 * не хуже фамилии, поэтому закрывается и она. Название работы менеджер
 * пишет от руки и нередко вписывает в него фамилию или ту же тему —
 * закрывается и оно; работа узнаётся по коду (решение Р-267).
 */
export const PERSONAL_COLUMNS: ReadonlySet<string> = new Set([
  'Имя', 'Контакт', 'Организация', 'Тема', 'Название', 'Что нужно', 'Сообщение',
  'Кто', 'Отзыв', 'Клиент', 'Менеджер', 'Исполнитель', 'Кем', 'Файл', 'Путь в зеркале',
]);

/** Чем заменяется закрытое значение. Пустое остаётся пустым: так видно, где данных не было. */
export const HIDDEN = 'скрыто';

/**
 * Обезличенная копия таблицы для проверочного хранилища (решение Р-265).
 *
 * Режим `YANDEX_DISK_SCOPE=anon` нужен, пока хранилище организации не
 * подключено, а связку проверить хочется: на личный Диск, у которого нет
 * договора поручения обработки (ч. 3 ст. 6 152-ФЗ), персональные данные
 * уходить не могут. Уходит всё остальное — даты, состояния, коды работ,
 * суммы и сроки, — и по такой таблице видно, что выгрузка живая и полная.
 */
export function anonymize(t: Table): Table {
  const hide = t.head.map((h) => PERSONAL_COLUMNS.has(h));
  const rows = t.data.map((row) =>
    row.map((cell, i) => (hide[i] && cell !== '' && cell !== null ? HIDDEN : cell)),
  );
  return table(t.file, t.name, t.head, rows);
}
