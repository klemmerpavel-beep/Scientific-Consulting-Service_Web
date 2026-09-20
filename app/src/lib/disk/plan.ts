/**
 * Что отправить на Диск, а что с него убрать.
 *
 * Зеркало ведётся по описи: рядом с файлами лежит служебная опись прошлого
 * прогона. Сравнение описи с нынешним состоянием даёт три ответа — что
 * появилось, что изменилось и что исчезло. Без описи пришлось бы обходить
 * Диск целиком на каждом прогоне: сотни запросов ради того, что и так
 * известно.
 *
 * Удаление — обязательная часть, а не украшение. Материал, изъятый по
 * требованию субъекта (ст. 21 152-ФЗ), должен исчезнуть и в зеркале; иначе
 * обезличивание на сервере оставляло бы копию в облаке, о которой никто не
 * помнит.
 */

export interface MirrorEntry {
  /** Путь внутри корневой папки зеркала. */
  readonly path: string;
  readonly sha256: string;
  readonly sizeBytes: number;
}

export interface SyncPlan {
  readonly upload: readonly MirrorEntry[];
  readonly remove: readonly string[];
  readonly keep: number;
}

/**
 * Опись: одна строка на файл, знаки табуляции между полями. Формат выбран
 * так, чтобы его читал человек, открывший файл на Диске, и чтобы разбор не
 * требовал ни одной зависимости.
 */
export function formatManifest(entries: readonly MirrorEntry[]): string {
  const rows = [...entries]
    .sort((a, b) => a.path.localeCompare(b.path, 'ru'))
    .map((e) => `${e.sha256}\t${e.sizeBytes}\t${e.path}`);
  return ['# опись зеркала ProDisser: свёртка<TAB>размер<TAB>путь', ...rows].join('\n') + '\n';
}

export function parseManifest(text: string): Map<string, MirrorEntry> {
  const out = new Map<string, MirrorEntry>();
  for (const line of text.split('\n')) {
    if (line.length === 0 || line.startsWith('#')) continue;
    const [sha256, size, ...rest] = line.split('\t');
    const path = rest.join('\t');
    if (!sha256 || !path) continue;
    const sizeBytes = Number(size);
    out.set(path, { path, sha256, sizeBytes: Number.isFinite(sizeBytes) ? sizeBytes : 0 });
  }
  return out;
}

/**
 * Сравнение желаемого состояния с описью.
 *
 * Свёртка сравнивается, а не время правки: время на Диске и на сервере живут
 * по своим часам, а совпадение свёртки означает, что файл тот же самый.
 */
export function planSync(
  desired: readonly MirrorEntry[],
  manifest: Map<string, MirrorEntry>,
): SyncPlan {
  const upload: MirrorEntry[] = [];
  let keep = 0;
  const wanted = new Set<string>();

  for (const entry of desired) {
    wanted.add(entry.path);
    const known = manifest.get(entry.path);
    if (known !== undefined && known.sha256 === entry.sha256) {
      keep += 1;
      continue;
    }
    upload.push(entry);
  }

  const remove = [...manifest.keys()].filter((path) => !wanted.has(path));
  return { upload, remove, keep };
}
