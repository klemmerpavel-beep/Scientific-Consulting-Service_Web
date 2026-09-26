/**
 * Имена и пути на облачном диске.
 *
 * Модуль намеренно чистый: ни базы, ни сети. Здесь решается, как выглядит
 * зеркало на Диске, и это решение надо проверять без подключения к Яндексу —
 * иначе его нельзя проверить вовсе.
 *
 * Пути строятся читаемыми: человек открывает Диск с телефона и должен
 * понимать, что перед ним, без сверки с базой. Поэтому в путь идут код
 * работы, название материала и исходное имя файла — а не внутренние
 * идентификаторы, которыми материал хранится на сервере.
 */

/** Разделитель в имени версии: «v2 — отчёт.docx». */
const VERSION_MARK = ' — ';

/**
 * Имя, пригодное для файловой системы и для WebDAV.
 *
 * Убираются разделители пути и управляющие знаки: имя приходит от
 * пользователя, и знак `/` в нём означал бы лишний уровень папок, а то и
 * выход за пределы каталога работы. Точки по краям снимаются — имя из одних
 * точек на большинстве систем неоткрываемо.
 */
export function safeSegment(raw: string, limit = 80): string {
  const cleaned = Array.from(raw.normalize('NFC'))
    .map((ch) => (ch.codePointAt(0)! < 0x20 || '\\/:*?"<>|'.includes(ch) ? ' ' : ch))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .replace(/\.+$/, '')
    .trim();
  if (cleaned.length === 0) return 'без названия';
  // Длина и обрезка — по знакам, а не по половинкам суррогатной пары:
  // эмодзи на границе обрезки распадался на одиночный суррогат, адрес
  // WebDAV не собирался, и файл не уходил на Диск ни на одном прогоне
  // (решение Р-246).
  const chars = Array.from(cleaned);
  if (chars.length <= limit) return cleaned;
  // Обрезается середина, а не хвост: расширение и начало названия несут
  // больше смысла, чем середина длинной фразы.
  const dot = chars.lastIndexOf('.');
  const ext = dot > 0 && chars.length - dot <= 12 ? chars.slice(dot).join('') : '';
  const head = chars.slice(0, limit - Array.from(ext).length - 1).join('').trim();
  return `${head}${ext}`;
}

/** Путь к папке работы внутри корневой папки зеркала. */
export function projectFolder(code: string): string {
  return `Работы/${safeSegment(code, 32)}`;
}

/**
 * Путь к файлу версии материала.
 *
 * Номер версии стоит перед именем файла, а не после: версии одного материала
 * выстраиваются в папке по порядку, и глазу не приходится искать номер в
 * конце длинного имени.
 */
export function versionPath(
  projectCode: string,
  materialTitle: string,
  versionNumber: number,
  originalName: string,
): string {
  return [
    projectFolder(projectCode),
    safeSegment(materialTitle, 60),
    `v${versionNumber}${VERSION_MARK}${safeSegment(originalName, 70)}`,
  ].join('/');
}

/** Путь к таблице реестра. */
export function tablePath(name: string): string {
  return `Таблицы/${name}`;
}

/**
 * Адрес WebDAV для пути зеркала. Каждый отрезок кодируется отдельно: косая
 * черта между отрезками должна остаться косой чертой, а внутри имени —
 * превратиться в `%2F`, иначе имя файла стало бы папкой.
 */
export function webdavUrl(base: string, folder: string, relative: string): string {
  const parts = [folder, ...relative.split('/')]
    .filter((part) => part.length > 0)
    .map((part) => encodeURIComponent(part));
  return `${base.replace(/\/+$/, '')}/${parts.join('/')}`;
}

/** Все папки, которые нужно завести перед записью файла. */
export function foldersFor(relative: string): string[] {
  const parts = relative.split('/').filter((part) => part.length > 0);
  parts.pop();
  const out: string[] = [];
  for (let i = 1; i <= parts.length; i += 1) out.push(parts.slice(0, i).join('/'));
  return out;
}

/**
 * Папка материала в зеркале. Два материала одной работы с одинаковым
 * названием — два «Счёт.pdf» к разным траншам — прежде ложились в одну
 * папку, и их версии с одинаковым именем затирали друг друга: зеркало
 * каждый час перезаливало одну поверх другой, а второго файла на Диске не
 * было никогда (решение Р-246). Первый по времени материал сохраняет
 * прежнюю папку, следующие получают « (2)», « (3)».
 */
export function materialFolders(
  materials: readonly { id: string; createdAt: Date; title: string; project: { code: string } }[],
): Map<string, string> {
  const unique = [...new Map(materials.map((m) => [m.id, m])).values()].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id),
  );
  const seen = new Map<string, number>();
  const out = new Map<string, string>();
  for (const material of unique) {
    const key = `${material.project.code}/${safeSegment(material.title, 60).toLowerCase()}`;
    const count = (seen.get(key) ?? 0) + 1;
    seen.set(key, count);
    out.set(
      material.id,
      count === 1 ? material.title : `${safeSegment(material.title, 54)} (${count})`,
    );
  }
  return out;
}
