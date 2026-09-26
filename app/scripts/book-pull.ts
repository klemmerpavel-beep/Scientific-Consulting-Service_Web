/**
 * Мост «Диск → база»: книга заказов с Яндекс Диска переезжает в кабинет.
 *
 *   node --env-file=.env scripts/book-pull.ts          → забрать и зафиксировать
 *   node --env-file=.env scripts/book-pull.ts --dry    → показать, что перенеслось бы
 *
 * Зачем он нужен, если аналитика уже онлайн. Аналитика кабинета читает базу
 * при каждом открытии — кэша нет ни на одной вкладке. Недостаёт другого:
 * чтобы в базу сами попадали изменения, которые практика вносит в таблицу
 * учёта. Пока учёт ведётся книгой, руководителю пришлось бы открывать экран
 * переноса и грузить файл руками; этот скрипт делает то же самое по
 * расписанию (решение Р-202).
 *
 * Что он переносит и чего не переносит. Фиксируются только строки без
 * замечаний. Строка, у которой разбор нашёл ошибку — несуществующая дата,
 * оплата больше договора, несведённый тип сопровождения, — остаётся в
 * предпросмотре и показывается руководителю как «требует разбора». Молча
 * угадывать за человека здесь нельзя: ошибка в книге — это либо опечатка,
 * либо настоящее расхождение, и разница между ними стоит денег.
 *
 * Почему не Google Sheets. В книге ФИО и суммы. Выгрузка их в Google — это
 * трансграничная передача в страну, которой нет в перечне обеспечивающих
 * адекватную защиту: отдельное согласие каждого субъекта, уведомление
 * Роскомнадзора до начала передачи и новая редакция Политики. Серверы
 * Яндекса — в России, передачи за границу нет (решения Р-155, Р-196).
 *
 * Целевое устройство обратное нынешнему: заказы ведутся в кабинете, а
 * таблица на Диске остаётся выгрузкой — её уже пишет `yandex-sync.ts`. Мост
 * нужен на переходное время.
 */
import { createHash } from 'node:crypto';

import { prisma } from '../src/lib/db.ts';
import type { Actor } from '../src/lib/cabinet/access.ts';
import { record } from '../src/lib/cabinet/audit.ts';
import { YandexDisk } from '../src/lib/disk/webdav.ts';
import { applyBatch, previewBook } from '../src/lib/cabinet/import/apply.ts';

const dry = process.argv.includes('--dry');
const user = process.env.YANDEX_DISK_USER?.trim() ?? '';
const password = process.env.YANDEX_DISK_PASSWORD?.trim() ?? '';
const folder = process.env.YANDEX_DISK_FOLDER?.trim() || 'ProDisser';
const base = process.env.YANDEX_DISK_WEBDAV?.trim() || 'https://webdav.yandex.ru';
/** Путь книги внутри папки практики на Диске. Пусто — мост выключен. */
const bookPath = process.env.BOOK_PULL_PATH?.trim() ?? '';

const say = (text: string) => console.log(`${new Date().toISOString()} ${text}`);

if (user.length === 0 || password.length === 0) {
  say('мост «Диск → база» выключен: YANDEX_DISK_USER или YANDEX_DISK_PASSWORD не задан');
  process.exit(0);
}
if (bookPath.length === 0) {
  say('мост «Диск → база» выключен: BOOK_PULL_PATH не задан');
  process.exit(0);
}

const disk = new YandexDisk({ base, user, password, folder });

/**
 * Действующее лицо берётся настоящее — руководитель практики из базы, а не
 * выдуманное: право на перенос проверяется по той же дорожке, что и на
 * экране, и расписание не становится обходным путём мимо матрицы прав
 * (тот же порядок, что в `yandex-sync.ts`).
 */
async function headActor(): Promise<Actor | null> {
  const head = await prisma.user.findFirst({
    where: { role: 'HEAD', status: 'ACTIVE' },
    orderBy: { createdAt: 'asc' },
    select: { id: true, role: true, status: true },
  });
  if (head === null) return null;
  return {
    id: head.id,
    role: head.role,
    status: head.status,
    clientProfileId: null,
    expertNdaSignedAt: null,
  };
}

async function main(): Promise<number> {
  const actor = await headActor();
  if (actor === null) {
    say('перенос пропущен: в кабинете нет действующего руководителя');
    return 0;
  }

  const bytes = await disk.get(bookPath);
  if (bytes === null) {
    say(`ОШИБКА: на Диске нет файла «${bookPath}»`);
    return 1;
  }

  // Тот же файл второй раз не разбирается вовсе. Иначе каждый час в базе
  // появлялась бы новая загрузка с полусотней строк «уже перенесено», и
  // экран переноса заплыл бы пустыми отчётами. Проверка по свёртке файла
  // дешевле разбора и точнее даты изменения на Диске.
  const digest = createHash('sha256').update(bytes).digest('hex');
  const known = await prisma.importBatch.findFirst({
    where: { sha256: digest, state: 'APPLIED' },
    select: { id: true, createdAt: true },
  });
  if (known !== null) {
    say(`книга не менялась с прошлого прогона (загрузка ${known.id}) — перенос не нужен`);
    return 0;
  }

  const preview = await previewBook(actor, { fileName: bookPath, bytes });
  // Строка с ошибкой разбора остаётся в предпросмотре: её разбирает человек.
  // Туда же попадает строка, похожая сразу на несколько перенесённых работ:
  // угадывать, какую из них поправили, мост не берётся (решение Р-252).
  const held = preview.rows.filter((row) => row.severity === 'ERROR').map((row) => row.rowNumber);
  // Строки стёртых по требованию субъекта заказчиков не переносятся никогда:
  // книга на Диске их ещё помнит, а кабинет — уже нет (решение Р-252).
  const erased = preview.rows.filter((row) => row.erased).length;

  say(
    `строк ${preview.rows.length}: завести ${preview.counts.CREATE}, ` +
      `обновить ${preview.counts.UPDATE}, уже перенесено ${preview.counts.SKIP - erased}; ` +
      `требуют разбора ${held.length}, стёрто по требованию субъекта ${erased}`,
  );

  if (dry) {
    for (const row of preview.rows.filter((r) => r.severity === 'ERROR')) {
      say(`  ! строка ${row.rowNumber}: ${row.issues.map((i) => i.label).join(', ')}`);
    }
    return 0;
  }

  const report = await applyBatch(actor, preview.batchId, {
    managerId: actor.id,
    excludeRows: held,
  });

  // Прогон отмечается в журнале действий тем же порядком, что и зеркало:
  // отдельной таблицы под это не заводится, а экран читает журнал
  // (решение Р-196).
  await record(null, {
    action: 'BOOK_PULL',
    objectType: 'ImportBatch',
    objectId: report.batchId,
    payload: {
      file: bookPath,
      rows: preview.rows.length,
      created: report.created,
      updated: report.updated,
      skipped: report.skipped,
      held: held.length,
      erased,
      rejected: report.rejected.length,
    },
  });

  say(
    `перенесено: заведено ${report.created}, обновлено ${report.updated}, ` +
      `пропущено ${report.skipped}; оставлено на разбор ${held.length}, ` +
      `отклонено ${report.rejected.length}`,
  );
  for (const row of report.rejected) say(`  × строка ${row.rowNumber}: ${row.reason}`);
  return 0;
}

try {
  process.exitCode = await main();
} finally {
  await prisma.$disconnect();
}
