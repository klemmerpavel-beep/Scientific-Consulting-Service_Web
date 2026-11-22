import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';

/**
 * Хранилище материалов.
 *
 * Байты никогда не отдаются напрямую из хранилища: выдача идёт через
 * серверный маршрут, который сначала спрашивает разрешение у модуля прав,
 * а затем пишет строку в журнал доступа. Именно поэтому здесь интерфейс,
 * а не прямой вызов клиента хранилища из обработчика.
 *
 * Реализаций две. `LocalStorage` — каталог на диске: им пользуются стенд
 * разработки и тесты, чтобы проверки не ходили в сеть. Боевая реализация
 * поверх S3-совместимого хранилища на территории России добавляется вместе
 * с выбором площадки: до тех пор в репозитории нет ни её зависимости, ни
 * настроек, которые нечем проверить.
 *
 * Ключ объекта строится из идентификаторов и случайной части. Исходное имя
 * файла в ключ не попадает: оно приходит от пользователя и может содержать
 * фамилию — путь к объекту не должен быть персональными данными.
 */

export interface StoredObject {
  readonly key: string;
  readonly sizeBytes: number;
  readonly sha256: string;
}

/**
 * Объект в перечне хранилища: ключ, размер и время записи. Перечень нужен
 * только сверке с базой (решение Р-986): выдача по-прежнему идёт по ключу.
 */
export interface ListedObject {
  readonly key: string;
  readonly sizeBytes: number;
  readonly modifiedAt: Date;
}

/** Объект, открытый на чтение потоком: байты не собираются в память целиком. */
export interface OpenedObject {
  readonly stream: ReadableStream<Uint8Array>;
  readonly sizeBytes: number;
}

export interface Storage {
  put(key: string, body: Buffer, contentType: string): Promise<StoredObject>;
  get(key: string): Promise<Buffer>;
  /** Открыть потоком. Необязательно: без него объект читается целиком. */
  open?(key: string): Promise<OpenedObject>;
  remove(key: string): Promise<void>;
  /** Ссылка ограниченного срока действия либо `null`, если выдача только потоком. */
  signedUrl(key: string, ttlSeconds: number): Promise<string | null>;
  /** Объекты под префиксом ключа. Необязательно: без него сверка не выполняется (Р-986). */
  list?(prefix: string): Promise<ListedObject[]>;
  /** Размер и время объекта либо `null`, если объекта нет. Необязательно. */
  stat?(key: string): Promise<Omit<ListedObject, 'key'> | null>;
}

export function materialKey(
  projectId: string,
  materialId: string,
  version: number,
  originalName: string,
): string {
  const ext = path.extname(originalName).toLowerCase().slice(0, 10);
  const safeExt = /^\.[a-z0-9]+$/.test(ext) ? ext : '';
  return `projects/${projectId}/materials/${materialId}/v${version}/${randomUUID()}${safeExt}`;
}

/**
 * Ключ вложения заявки.
 *
 * Тот же порядок, что у версий материалов: исходное имя в ключ не
 * попадает — оно приходит от человека и может содержать фамилию
 * (решение Р-191).
 */
export function leadAttachmentKey(leadId: string, originalName: string): string {
  const ext = path.extname(originalName).toLowerCase().slice(0, 10);
  const safeExt = /^\.[a-z0-9]+$/.test(ext) ? ext : '';
  return `leads/${leadId}/${randomUUID()}${safeExt}`;
}

export function sha256(body: Buffer): string {
  return createHash('sha256').update(body).digest('hex');
}

/**
 * Идентификатор строки, заданный до её записи: ключ объекта строится от
 * идентификатора материала, а файл пишется раньше строки (К-6, решение
 * Р-1006). Вид — как у `cuid` базы: «c» и строчная латиница с цифрами,
 * его узнают подписи журнала (Р-821).
 */
export function newRowId(): string {
  const random = [...randomBytes(16)].map((byte) => (byte % 36).toString(36)).join('');
  return `c${Date.now().toString(36).padStart(9, '0')}${random}`;
}

/**
 * Создание файла (К-6, решение Р-1006): объекты уже записаны, `write` —
 * одна транзакция со строками базы и строкой журнала. Отказ транзакции
 * убирает записанные объекты; сбой уборки — в журнал сервера с ключом
 * (ключ персональных данных не несёт, Р-191), а сирота видна сверке
 * (Р-986).
 */
export async function undoObjectsOnFailure<T>(store: Storage, keys: readonly string[], write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (error) {
    await removeObjects(store, keys, 'объект не убран после отказа записи');
    throw error;
  }
}

/**
 * Удаление файлов после фиксации (К-6, решение Р-1006): строки базы и
 * строка журнала уже записаны одной транзакцией. Сбой удаления действие
 * не откатывает — он уходит в журнал сервера с ключом; возвращается
 * число неудалённых объектов.
 */
export async function removeObjects(store: Storage, keys: readonly string[], what: string): Promise<number> {
  let failed = 0;
  for (const key of keys) {
    try {
      await store.remove(key);
    } catch (error) {
      failed += 1;
      console.error(`[storage] ${what}`, key, error);
    }
  }
  return failed;
}

export class LocalStorage implements Storage {
  private readonly root: string;

  constructor(root: string) {
    this.root = root;
  }

  private resolve(key: string): string {
    // Ключи строит сервер, но проверка обязательна: путь наружу каталога
    // означал бы запись куда угодно на диске.
    const full = path.resolve(this.root, key);
    if (!full.startsWith(path.resolve(this.root) + path.sep)) {
      throw new Error('Ключ объекта выходит за пределы каталога хранилища');
    }
    return full;
  }

  async put(key: string, body: Buffer): Promise<StoredObject> {
    const full = this.resolve(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, body);
    return { key, sizeBytes: body.byteLength, sha256: sha256(body) };
  }

  async get(key: string): Promise<Buffer> {
    return readFile(this.resolve(key));
  }

  async open(key: string): Promise<OpenedObject> {
    const full = this.resolve(key);
    const { size } = await stat(full);
    return {
      stream: Readable.toWeb(createReadStream(full)) as ReadableStream<Uint8Array>,
      sizeBytes: size,
    };
  }

  async remove(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true });
  }

  /**
   * Файлы под префиксом — ключами от корня хранилища. Каталога нет — нет и
   * файлов: хранилище, куда ещё ничего не клали, не сбой (Р-986).
   */
  async list(prefix: string): Promise<ListedObject[]> {
    const root = path.resolve(this.root);
    let entries;
    try {
      entries = await readdir(this.resolve(prefix), { recursive: true, withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException | null)?.code === 'ENOENT') return [];
      throw error;
    }
    const out: ListedObject[] = [];
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const full = path.join(entry.parentPath, entry.name);
      const { size, mtime } = await stat(full);
      out.push({ key: path.relative(root, full).split(path.sep).join('/'), sizeBytes: size, modifiedAt: mtime });
    }
    return out.sort((a, b) => a.key.localeCompare(b.key));
  }

  async stat(key: string): Promise<Omit<ListedObject, 'key'> | null> {
    try {
      const { size, mtime } = await stat(this.resolve(key));
      return { sizeBytes: size, modifiedAt: mtime };
    } catch (error) {
      if ((error as NodeJS.ErrnoException | null)?.code === 'ENOENT') return null;
      throw error;
    }
  }

  async signedUrl(): Promise<string | null> {
    // Локальное хранилище ссылок не выдаёт: файл отдаётся потоком через
    // маршрут, и это тот же путь, по которому пойдёт боевая выдача.
    return null;
  }
}

let current: Storage | null = null;

export function storage(): Storage {
  if (current !== null) return current;
  const root = process.env.CABINET_STORAGE_DIR;
  if (!root) {
    throw new Error(
      'CABINET_STORAGE_DIR не задан. Материалы кабинета негде хранить: ' +
        'укажите каталог на стенде разработки либо подключите боевое хранилище.',
    );
  }
  current = new LocalStorage(root);
  return current;
}

/**
 * Открыть объект на выдачу (решение Р-247).
 *
 * Прежде выдача читала файл целиком — до 50 МБ на каждое скачивание, и
 * несколько одновременных скачиваний глав упирались в память контейнера.
 * Теперь байты идут потоком с диска; хранилище без потокового чтения
 * (подмена в тестах) отдаёт прочитанное целиком тем же видом.
 */
export async function openObject(store: Storage, key: string): Promise<OpenedObject> {
  try {
    if (store.open !== undefined) return await store.open(key);
    return await openWhole(store, key);
  } catch (error) {
    // Строка в базе есть, объекта в хранилище нет: сбой диска, прерванная
    // загрузка, восстановление из копии. Прежде выдача отвечала голой
    // ошибкой 500 (аудит 15.11.2026, находка Ф-5, решение Р-907).
    if ((error as NodeJS.ErrnoException | null)?.code === 'ENOENT') throw new ObjectMissing(key);
    throw error;
  }
}

/** Объекта нет в хранилище, хотя строка о нём в базе есть (Р-907). */
export class ObjectMissing extends Error {
  /** Тот же признак, что у ошибки диска: прежние проверки по коду действуют. */
  readonly code = 'ENOENT';
  /** Ключ объекта — для журнала сервера; человеку он не показывается. */
  readonly key: string;

  constructor(key: string) {
    super('Файл не найден в хранилище');
    this.name = 'ObjectMissing';
    this.key = key;
  }
}

/** Что сказать человеку, которому файл положен, а объекта нет (Р-907). */
export const OBJECT_MISSING_TEXT =
  'Файл не найден в хранилище. Напишите менеджеру работы: он приложит файл заново.';

async function openWhole(store: Storage, key: string): Promise<OpenedObject> {
  const body = await store.get(key);
  return {
    stream: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(body));
        controller.close();
      },
    }),
    sizeBytes: body.byteLength,
  };
}

/** Подмена хранилища в тестах. */
export function setStorage(next: Storage | null): void {
  current = next;
}
