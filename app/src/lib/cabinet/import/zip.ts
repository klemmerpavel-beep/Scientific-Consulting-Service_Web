import { inflateRawSync } from 'node:zlib';

/**
 * Распаковка `.xlsx`. Книга Excel — это ZIP-архив, и читается он здесь
 * вручную по APPNOTE.TXT §4.3, без сторонней библиотеки.
 *
 * Причина не в аскетизме: статус заказа в исходной книге размечен **заливкой
 * ячейки**, а не текстом, и простые разборщики таблиц заливку не отдают.
 * Разбирая архив самостоятельно, мы получаем и `styles.xml`, без которого
 * половина сведений о заказах теряется.
 *
 * Перенесено из соседнего проекта панели, где тот же файл разбирается уже
 * не первый месяц. Инфляция выполняется средствами Node, а не потоками
 * браузера: на сервере это проще и синхронно.
 */

export type ImportErrorCode = 'EMPTY' | 'NOT_ZIP' | 'NOT_XLSX' | 'EMPTY_HEADER' | 'UNSUPPORTED';

export class ImportError extends Error {
  readonly code: ImportErrorCode;

  constructor(code: ImportErrorCode, message: string) {
    super(message);
    this.name = 'ImportError';
    this.code = code;
  }
}

const SIGNATURE_EOCD = 0x06054b50;
const SIGNATURE_CENTRAL = 0x02014b50;
const SIGNATURE_LOCAL = 0x04034b50;

/** Комментарий в конце архива ограничен 64 КиБ — дальше искать незачем. */
const MAX_COMMENT = 65_536;

/**
 * Предел распакованного объёма — на файл архива и на весь архив.
 *
 * Книга заказов весит сотни килобайт; сжатый в несколько килобайт
 * «архив-бомба» разворачивался бы в гигабайты и занимал память сервера
 * целиком (решение Р-239). Пределы с запасом на порядок выше настоящей
 * книги с годами истории.
 */
const MAX_ENTRY_BYTES = 64 * 1024 * 1024;
const MAX_TOTAL_BYTES = 128 * 1024 * 1024;

export function unzip(input: Buffer): Map<string, Buffer> {
  if (input.length < 22) {
    throw new ImportError('EMPTY', 'Файл пуст или слишком мал для книги Excel.');
  }

  let eocd = -1;
  for (let i = input.length - 22; i >= 0 && i >= input.length - 22 - MAX_COMMENT; i -= 1) {
    if (input.readUInt32LE(i) === SIGNATURE_EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) {
    throw new ImportError(
      'NOT_ZIP',
      'Это не книга Excel: структура ZIP не найдена. Нужен файл .xlsx.',
    );
  }

  const count = input.readUInt16LE(eocd + 10);
  const centralOffset = input.readUInt32LE(eocd + 16);

  interface Entry {
    name: string;
    method: number;
    compressedSize: number;
    localHeader: number;
  }

  const entries: Entry[] = [];
  let p = centralOffset;
  for (let e = 0; e < count; e += 1) {
    if (input.readUInt32LE(p) !== SIGNATURE_CENTRAL) {
      throw new ImportError('NOT_ZIP', 'Повреждённый архив: неверная запись каталога.');
    }
    const nameLength = input.readUInt16LE(p + 28);
    entries.push({
      method: input.readUInt16LE(p + 10),
      compressedSize: input.readUInt32LE(p + 20),
      localHeader: input.readUInt32LE(p + 42),
      name: input.subarray(p + 46, p + 46 + nameLength).toString('utf8'),
    });
    p += 46 + nameLength + input.readUInt16LE(p + 30) + input.readUInt16LE(p + 32);
  }

  const files = new Map<string, Buffer>();
  let total = 0;
  for (const entry of entries) {
    if (entry.name.endsWith('/')) continue;

    const header = entry.localHeader;
    if (input.readUInt32LE(header) !== SIGNATURE_LOCAL) {
      throw new ImportError(
        'NOT_ZIP',
        `Повреждённый архив: неверный локальный заголовок «${entry.name}».`,
      );
    }
    // Имя и дополнительное поле в локальном заголовке имеют собственную
    // длину и с центральным каталогом могут не совпадать (§4.3.7).
    const dataStart =
      header + 30 + input.readUInt16LE(header + 26) + input.readUInt16LE(header + 28);
    const chunk = input.subarray(dataStart, dataStart + entry.compressedSize);

    let body: Buffer;
    if (entry.method === 0) body = Buffer.from(chunk);
    else if (entry.method === 8) {
      try {
        body = inflateRawSync(chunk, { maxOutputLength: MAX_ENTRY_BYTES });
      } catch (error) {
        const tooLarge = (error as { code?: string }).code === 'ERR_BUFFER_TOO_LARGE';
        throw new ImportError(
          'NOT_ZIP',
          tooLarge
            ? `Файл «${entry.name}» в архиве после распаковки больше допустимого.`
            : `Повреждённый архив: не распаковывается «${entry.name}».`,
        );
      }
    } else throw new ImportError('UNSUPPORTED', 'В архиве применён неподдерживаемый метод сжатия.');
    total += body.byteLength;
    if (body.byteLength > MAX_ENTRY_BYTES || total > MAX_TOTAL_BYTES) {
      throw new ImportError('NOT_ZIP', 'Архив после распаковки больше допустимого.');
    }
    files.set(entry.name, body);
  }

  return files;
}
