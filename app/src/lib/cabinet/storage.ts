import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
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
  if (store.open !== undefined) return store.open(key);
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
