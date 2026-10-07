/**
 * Запрет исполняемых файлов и установщиков (требование Т-22, решение
 * Р-296).
 *
 * Модуль чистый: ни базы, ни хранилища, ни библиотек. Проверяется имя —
 * последнее расширение после нормализации — и содержимое по сигнатуре.
 * Остальные типы разрешены: научные данные приходят в разных форматах, и
 * перечень разрешённого отрезал бы рабочие файлы.
 *
 * Архив с исполняемым файлом внутри не ловится: распаковка и проверка
 * вложений — область отдельной защиты (П-06).
 */

/** Исполняемые файлы, установщики и сценарии (раздел 10, п. 10). */
export const BLOCKED_EXTENSIONS: ReadonlySet<string> = new Set([
  'exe', 'msi', 'msp', 'msix', 'appx', 'com', 'scr', 'pif', 'cpl', 'dll', 'sys', 'ocx',
  'bat', 'cmd', 'vbs', 'vbe', 'js', 'jse', 'wsf', 'wsh', 'hta', 'ps1', 'psm1', 'lnk',
  'reg', 'jar', 'apk', 'aab', 'xapk', 'dmg', 'pkg', 'deb', 'rpm',
  // Запускаемое двойным щелчком в Windows без установщика: образы дисков
  // (монтируются с программой внутри), справка CHM, OneNote, надстройка
  // Excel, ярлыки и оснастки, веб-запросы и SYLK (решение Р-427). Сырые
  // образы .img не запрещаются по имени: так же называются научные данные
  // (ERDAS, Analyze) — образ ISO ловится по содержимому.
  'iso', 'vhd', 'vhdx', 'chm', 'hlp', 'one', 'onepkg', 'xll', 'url', 'scf', 'msc',
  'application', 'appref-ms', 'xbap', 'wsc', 'sct', 'settingcontent-ms', 'iqy', 'slk',
  'cab', 'inf', 'gadget', 'library-ms', 'search-ms',
]);

/**
 * Примеры запрещённого в подсказке поля файла: человек узнаёт о запрете до
 * выбора файла, а не из отказа (улучшение УК-16, решение Р-367). Полный
 * перечень длинен для подсказки; примеры берутся из него.
 */
export const BLOCKED_EXAMPLES = ['exe', 'msi', 'bat', 'cmd', 'js', 'jar', 'apk', 'dmg'] as const;

export const BLOCKED_HINT = `Не принимаются программы, установщики и сценарии: ${BLOCKED_EXAMPLES.map((ext) => `.${ext}`).join(', ')} и другие исполняемые файлы.`;

/** Знаки направления письма: U+202E показывает «fdp.exe» как «exe.pdf». */
const BIDI = /[‎‏‪-‮⁦-⁩]/gu;

/**
 * Имя для проверки: без знаков направления, без альтернативного потока
 * NTFS («отчёт.pdf:поток»), без хвостовых точек и пробелов, которые
 * Windows отбрасывает при сохранении, в нижнем регистре.
 */
export function normalizeName(name: string): string {
  const base = name.replace(BIDI, '').split(/[\\/]/u).pop() ?? '';
  const colon = base.indexOf(':');
  const withoutStream = colon >= 0 ? base.slice(0, colon) : base;
  return withoutStream.replace(/[.\s]+$/u, '').toLowerCase();
}

/** Последнее расширение без точки; пусто, если его нет. */
export function lastExtension(name: string): string {
  const normal = normalizeName(name);
  const dot = normal.lastIndexOf('.');
  return dot <= 0 ? '' : normal.slice(dot + 1);
}

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;

/** Имена записей ZIP по центральному каталогу, без распаковки. */
function zipNames(body: Buffer): string[] {
  if (body.length < 22) return [];
  let eocd = -1;
  for (let i = body.length - 22; i >= 0 && i >= body.length - 22 - 0xffff; i -= 1) {
    if (body.readUInt32LE(i) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return [];
  const count = body.readUInt16LE(eocd + 10);
  let p = body.readUInt32LE(eocd + 16);
  const names: string[] = [];
  for (let e = 0; e < count; e += 1) {
    if (p + 46 > body.length || body.readUInt32LE(p) !== CENTRAL) break;
    const nameLength = body.readUInt16LE(p + 28);
    names.push(body.subarray(p + 46, p + 46 + nameLength).toString('utf8'));
    p += 46 + nameLength + body.readUInt16LE(p + 30) + body.readUInt16LE(p + 32);
  }
  return names;
}

/** Исполняемое ли содержимое — по сигнатуре, независимо от имени. */
export function executableContent(body: Buffer): boolean {
  if (body.length >= 4) {
    // MZ — только с заголовком PE по смещению из 0x3C: текст, начатый
    // буквами «MZ», исполняемым не считается.
    if (body[0] === 0x4d && body[1] === 0x5a && body.length >= 0x40) {
      const pe = body.readUInt32LE(0x3c);
      if (pe + 4 <= body.length && body.readUInt32LE(pe) === 0x00004550) return true;
    }
    const magic = body.readUInt32BE(0);
    // ELF; Mach-O в обоих порядках байтов и «толстый» Mach-O (он же класс Java).
    if (magic === 0x7f454c46) return true;
    if ([0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe, 0xcafebabe].includes(magic)) return true;
  }
  // Образы дисков под любым именем: ISO 9660 (метка «CD001» в первом
  // описателе тома), VHDX и VHD (подпись в начале или в хвосте файла).
  // Windows монтирует их двойным щелчком вместе с программой внутри
  // (решение Р-427).
  for (const at of [0x8001, 0x8801, 0x9001]) {
    if (body.length >= at + 5 && body.subarray(at, at + 5).toString('latin1') === 'CD001') return true;
  }
  if (body.length >= 8 && body.subarray(0, 8).toString('latin1') === 'vhdxfile') return true;
  if (body.length >= 512) {
    const footer = body.subarray(body.length - 512, body.length - 504).toString('latin1');
    if (footer === 'conectix' || body.subarray(0, 8).toString('latin1') === 'conectix') return true;
  }
  // ZIP-установщики: jar, apk и aab, appx и msix. Документы Office и
  // OpenDocument — тоже ZIP, но таких записей у них нет.
  const names = zipNames(body);
  if (names.length > 0) {
    const has = (test: (name: string) => boolean) => names.some(test);
    if (has((n) => n === 'META-INF/MANIFEST.MF') && has((n) => n.endsWith('.class'))) return true;
    if (has((n) => n.endsWith('AndroidManifest.xml')) && has((n) => n.endsWith('.dex'))) return true;
    if (has((n) => n === 'AppxManifest.xml' || n === 'AppxMetadata/AppxBundleManifest.xml')) return true;
  }
  return false;
}

/**
 * Текст отказа для исполняемого файла или `null`, если файл принимается.
 * msi отличается от старых doc и xls только расширением: сигнатура
 * составного файла у них общая.
 */
export function fileRefusal(name: string, body: Buffer): string | null {
  const blocked = BLOCKED_EXTENSIONS.has(lastExtension(name)) || executableContent(body);
  if (!blocked) return null;
  const shown = name.replace(BIDI, '').slice(0, 120);
  return (
    `Файл «${shown}» не принят: исполняемые файлы и установщики загружать нельзя. ` +
    'Если файл нужен для работы, напишите менеджеру'
  );
}
