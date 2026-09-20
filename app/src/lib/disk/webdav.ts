import { foldersFor, webdavUrl } from './paths.ts';

/**
 * Минимальный клиент WebDAV Яндекс Диска.
 *
 * Зачем свой, а не библиотека: нужны четыре действия — завести папку,
 * положить файл, забрать файл, удалить файл, — и ради них не стоит вводить
 * зависимость, которую придётся обновлять и проверять. Протокол здесь
 * используется ровно в той части, что описана в справке Яндекса.
 *
 * Переносчик запросов передаётся снаружи. Это не отвлечённая гибкость:
 * проверки идут без сети, и без подмены переносчика их нельзя было бы
 * написать вовсе — сборка в среде разработки наружу не ходит.
 */

export type Transport = (url: string, init: RequestInit) => Promise<Response>;

export interface DiskOptions {
  readonly base: string;
  readonly user: string;
  readonly password: string;
  readonly folder: string;
  readonly transport?: Transport;
  /** Сколько раз повторять при сетевом отказе или ответе 5xx. */
  readonly retries?: number;
}

export class DiskError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'DiskError';
    this.status = status;
  }
}

/** Ответ, после которого повторять бессмысленно: дело не в сети. */
function fatal(status: number): boolean {
  return status === 401 || status === 403 || status === 507 || (status >= 400 && status < 500);
}

export class YandexDisk {
  private readonly o: Required<Omit<DiskOptions, 'transport'>> & { transport: Transport };
  /** Папки, заведённые в этом прогоне: второй MKCOL по ним не нужен. */
  private readonly known = new Set<string>();

  constructor(options: DiskOptions) {
    this.o = {
      base: options.base,
      user: options.user,
      password: options.password,
      folder: options.folder,
      retries: options.retries ?? 3,
      transport: options.transport ?? ((url, init) => fetch(url, init)),
    };
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    const auth = Buffer.from(`${this.o.user}:${this.o.password}`).toString('base64');
    return { authorization: `Basic ${auth}`, ...extra };
  }

  private async call(
    method: string,
    relative: string,
    body?: Buffer | undefined,
    allowed: readonly number[] = [200, 201, 204],
  ): Promise<Response> {
    const url = webdavUrl(this.o.base, this.o.folder, relative);
    let lastError = '';
    for (let attempt = 1; attempt <= this.o.retries; attempt += 1) {
      let res: Response;
      try {
        res = await this.o.transport(url, {
          method,
          headers: this.headers(body === undefined ? {} : { 'content-type': 'application/octet-stream' }),
          body: body === undefined ? undefined : new Uint8Array(body),
          signal: AbortSignal.timeout(120_000),
        });
      } catch (e) {
        lastError = String(e).slice(0, 200);
        if (attempt === this.o.retries) break;
        await new Promise((r) => setTimeout(r, attempt * 2000));
        continue;
      }
      if (allowed.includes(res.status)) return res;
      if (fatal(res.status)) {
        throw new DiskError(`${method} ${relative}: ответ ${res.status}`, res.status);
      }
      lastError = `ответ ${res.status}`;
      if (attempt === this.o.retries) break;
      await new Promise((r) => setTimeout(r, attempt * 2000));
    }
    throw new DiskError(`${method} ${relative}: ${lastError}`, 0);
  }

  /** Завести папку и все её родительские. Существующая папка отвечает 405. */
  async ensureFolders(relative: string): Promise<void> {
    for (const folder of ['', ...foldersFor(relative)]) {
      if (this.known.has(folder)) continue;
      await this.call('MKCOL', folder, undefined, [201, 405]);
      this.known.add(folder);
    }
  }

  async put(relative: string, body: Buffer): Promise<void> {
    await this.ensureFolders(relative);
    await this.call('PUT', relative, body, [200, 201, 204]);
  }

  /** Содержимое файла либо `null`, если его нет: опись первого прогона. */
  async get(relative: string): Promise<Buffer | null> {
    try {
      const res = await this.call('GET', relative, undefined, [200]);
      return Buffer.from(await res.arrayBuffer());
    } catch (e) {
      if (e instanceof DiskError && e.status === 404) return null;
      throw e;
    }
  }

  /** Удалить файл. Отсутствие файла — не ошибка: цель достигнута. */
  async remove(relative: string): Promise<void> {
    await this.call('DELETE', relative, undefined, [200, 204, 404]);
  }
}
