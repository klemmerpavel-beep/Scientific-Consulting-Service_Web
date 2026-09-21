/**
 * Зеркало практики на Яндекс Диске: таблицы реестров и файлы материалов.
 *
 *   node --env-file=.env scripts/yandex-sync.ts          → выгрузить
 *   node --env-file=.env scripts/yandex-sync.ts --dry    → показать, что ушло бы
 *
 * Зачем зеркало, если всё есть в кабинете. Кабинет — рабочее место: он
 * отвечает на вопрос «что сейчас». Диск — это то, что открывается с телефона
 * без входа в кабинет, отдаётся бухгалтеру одной папкой и переживает сервер.
 * Первоисточник остаётся на сервере: зеркало собирается из базы и хранилища,
 * а не наоборот, и ничего из него обратно не читается.
 *
 * ЧТО ТРЕБУЕТСЯ ДО ВКЛЮЧЕНИЯ. В таблицах и материалах персональные данные.
 * Хранилище — третье лицо, и обработка ему поручается по договору
 * (ч. 3 ст. 6 152-ФЗ): годится тариф для организаций, личный Диск не годится.
 * Перечень поручений в Политике дополняется пунктом об облачном хранилище —
 * это правка юридического текста, она идёт через юриста. Пока доступ не
 * задан, скрипт молча ничего не делает: выгрузка выключена, а не сломана.
 */
import { prisma } from '../src/lib/db.ts';
import type { Actor } from '../src/lib/cabinet/access.ts';
import { record } from '../src/lib/cabinet/audit.ts';
import { sha256, storage } from '../src/lib/cabinet/storage.ts';
import { YandexDisk } from '../src/lib/disk/webdav.ts';
import { formatManifest, parseManifest, planSync, type MirrorEntry } from '../src/lib/disk/plan.ts';
import { tablePath } from '../src/lib/disk/paths.ts';
import {
  leadsTable,
  materialFiles,
  materialsTable,
  paymentsTable,
  projectsTable,
  reviewsTable,
  stagesTable,
  yearsTable,
  type Table,
} from '../src/lib/disk/registry.ts';

const MANIFEST = '.opis-zerkala.tsv';

const dry = process.argv.includes('--dry');
const user = process.env.YANDEX_DISK_USER?.trim() ?? '';
const password = process.env.YANDEX_DISK_PASSWORD?.trim() ?? '';
const folder = process.env.YANDEX_DISK_FOLDER?.trim() || 'ProDisser';
const base = process.env.YANDEX_DISK_WEBDAV?.trim() || 'https://webdav.yandex.ru';
/** `tables` — только таблицы, `all` — ещё и файлы материалов. */
const scope = (process.env.YANDEX_DISK_SCOPE?.trim() || 'all').toLowerCase();

const say = (text: string) => console.log(`${new Date().toISOString()} ${text}`);

if (user.length === 0 || password.length === 0) {
  say('выгрузка на Диск выключена: YANDEX_DISK_USER или YANDEX_DISK_PASSWORD не задан');
  process.exit(0);
}

const disk = new YandexDisk({ base, user, password, folder });

/**
 * Итоги по годам считает модуль кабинета, и ему нужно действующее лицо с
 * правом видеть маржу. Берётся настоящий руководитель практики, а не
 * выдуманный: право проверяется по той же дорожке, что и на экране, и
 * выгрузка не становится обходным путём к деньгам.
 */
async function headActor(): Promise<Actor | null> {
  const head = await prisma.user.findFirst({
    where: { role: 'HEAD', status: 'ACTIVE' },
    select: { id: true, role: true, status: true },
  });
  if (head === null) return null;
  return { id: head.id, role: head.role, status: head.status, clientProfileId: null, expertNdaSignedAt: null };
}

async function main(): Promise<number> {
  const files = scope === 'all' ? await materialFiles() : [];
  const actor = await headActor();

  const tables: Table[] = [
    await leadsTable(),
    await reviewsTable(),
    await projectsTable(),
    await stagesTable(),
    await paymentsTable(),
    await materialsTable(files),
  ];
  if (actor !== null) {
    tables.push(await yearsTable(actor));
  } else {
    say('итоги по годам пропущены: в кабинете нет действующего руководителя');
  }

  // Таблицы участвуют в описи наравне с файлами: пересобранная, но не
  // изменившаяся таблица второй раз не уходит.
  const desired: MirrorEntry[] = tables.map((t) => {
    const body = Buffer.from(t.body, 'utf8');
    return { path: tablePath(t.name), sha256: sha256(body), sizeBytes: body.byteLength };
  });
  const bodies = new Map<string, Buffer>();
  tables.forEach((t, i) => bodies.set(desired[i]!.path, Buffer.from(t.body, 'utf8')));

  for (const file of files) {
    desired.push({ path: file.path, sha256: file.sha256, sizeBytes: file.sizeBytes });
  }

  const manifestBody = dry ? null : await disk.get(MANIFEST);
  const manifest = parseManifest(manifestBody?.toString('utf8') ?? '');
  const plan = planSync(desired, manifest);

  say(
    `таблиц ${tables.length}, файлов ${files.length}; ` +
      `отправить ${plan.upload.length}, удалить ${plan.remove.length}, без изменений ${plan.keep}`,
  );
  if (dry) {
    for (const item of plan.upload) say(`  → ${item.path}`);
    for (const path of plan.remove) say(`  × ${path}`);
    return 0;
  }

  const objects = storage();
  const keyByPath = new Map(files.map((f) => [f.path, f.storageKey]));
  const done: MirrorEntry[] = desired.filter((e) => {
    const known = manifest.get(e.path);
    return known !== undefined && known.sha256 === e.sha256;
  });

  let failed = 0;
  for (const item of plan.upload) {
    try {
      const body = bodies.get(item.path) ?? (await objects.get(keyByPath.get(item.path)!));
      await disk.put(item.path, body);
      done.push(item);
    } catch (e) {
      failed += 1;
      say(`ОШИБКА: не ушло «${item.path}»: ${String(e).slice(0, 200)}`);
    }
  }

  for (const path of plan.remove) {
    try {
      await disk.remove(path);
    } catch (e) {
      failed += 1;
      say(`ОШИБКА: не удалено «${path}»: ${String(e).slice(0, 200)}`);
      // Строка остаётся в описи: иначе следующий прогон решит, что файла на
      // Диске нет, и удалять будет нечего — а он там есть.
      const kept = manifest.get(path);
      if (kept !== undefined) done.push(kept);
    }
  }

  // Опись пишется в конце и только из того, что действительно на Диске.
  // Опись, записанная наперёд, при обрыве связи расходится с Диском, и
  // расхождение уже ничем не чинится, кроме полного обхода.
  await disk.put(MANIFEST, Buffer.from(formatManifest(done), 'utf8'));

  // Прогон отмечается в журнале действий: иначе о зеркале известно
  // только из журнала процесса на сервере, а руководителю нужно видеть
  // в кабинете, что выгрузка идёт и когда она была последней
  // (решение Р-196). Действующего лица нет — прогон идёт по расписанию.
  await record(null, {
    action: 'DISK_SYNC',
    objectType: 'Mirror',
    payload: {
      uploaded: plan.upload.length,
      removed: plan.remove.length,
      failed,
      files: done.length,
      scope,
    },
  });

  say(failed === 0 ? `готово: в зеркале ${done.length} файлов` : `завершено с ошибками: ${failed}`);
  return failed === 0 ? 0 : 1;
}

try {
  process.exitCode = await main();
} finally {
  await prisma.$disconnect();
}
