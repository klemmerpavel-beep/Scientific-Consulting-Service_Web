/**
 * Пределы тела запроса пропускают файлы кабинета (решение Р-231).
 *
 * nginx принимал не больше 1 МБ, серверные действия Next — тоже 1 МБ по
 * умолчанию, а экраны и документация обещали материал до 50 МБ и
 * обращение из пяти файлов по 25 МБ. Любая глава в PDF получала 413.
 * Проверки держат три места в согласии: константы кабинета, предел
 * серверных действий и предел nginx для `/cabinet`.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const APP = path.join(import.meta.dirname, '..');
const ROOT = path.join(APP, '..');
const MB = 1024 * 1024;

const read = (relative: string) => readFileSync(path.join(ROOT, relative), 'utf8');

/** Число байт из выражения вида `25 * 1024 * 1024` в исходнике. */
function constant(source: string, name: string): number {
  const match = new RegExp(`export const ${name} = ([0-9 *]+);`, 'u').exec(source);
  assert.ok(match !== null, `нет константы ${name}`);
  return match[1]!.split('*').reduce((product, part) => product * Number(part.trim()), 1);
}

const queries = read('app/src/lib/cabinet/queries.ts');
const materials = read('app/src/lib/cabinet/materials.ts');
const requestBytes =
  constant(queries, 'REQUEST_FILES_MAX') * constant(queries, 'REQUEST_FILE_MAX_BYTES');
const materialBytes = constant(materials, 'MAX_UPLOAD_BYTES');

const actionLimit = (() => {
  const match = /bodySizeLimit: '(\d+)mb'/u.exec(read('app/next.config.mjs'));
  assert.ok(match !== null, 'предел серверных действий не задан');
  return Number(match[1]) * MB;
})();

const nginx = read('deploy/nginx.conf');

describe('пределы загрузки файлов', () => {
  it('серверные действия принимают самое большое обращение и материал', () => {
    assert.ok(actionLimit > requestBytes, `${actionLimit} ≤ ${requestBytes}`);
    assert.ok(actionLimit > materialBytes);
  });

  it('nginx пропускает в кабинет ровно столько же', () => {
    const block = /location \/cabinet \{([^}]*)\}/u.exec(nginx);
    assert.ok(block !== null, 'в nginx.conf нет блока для /cabinet');
    const size = /client_max_body_size (\d+)m;/u.exec(block[1]!);
    assert.ok(size !== null);
    assert.equal(Number(size[1]) * MB, actionLimit);
  });

  it('формы сайта по-прежнему ограничены мегабайтом', () => {
    // Публичные формы файлов не принимают: большой предел им не нужен.
    const server = nginx.slice(nginx.lastIndexOf('server {'));
    assert.match(server.slice(0, server.indexOf('location')), /client_max_body_size 1m;/u);
  });

  it('выкат приводит nginx на сервере к файлу из репозитория', () => {
    // Иначе правка nginx.conf до сервера не доезжает (решение Р-231).
    assert.match(read('deploy/update.sh'), /nginx-sync\.sh/u);
  });

  it('выкат ставит расписание связки с Диском', () => {
    // Иначе связка, готовая в коде, ждёт ручного crontab -e (решение Р-262).
    assert.match(read('deploy/update.sh'), /cron-sync\.sh/u);
    const cron = read('deploy/cron-sync.sh');
    for (const job of ['outbox.sh', 'yandex-sync.sh', 'book-pull.sh', 'retention.sh', 'restore-check.sh']) {
      assert.match(cron, new RegExp(`\\$DIR/${job.replace('.', '\\.')}`, 'u'));
    }
    // Прежний скрипт выгрузки снимается с расписания, а не ставится.
    assert.doesNotMatch(cron, /\$DIR\/yandex-upload\.sh/u);
  });

  it('выкат при любом исходе печатает отчёт о цепочке, без секретов', () => {
    // Отчёт — единственный взгляд на сервер без захода на него (Р-263).
    const update = read('deploy/update.sh');
    assert.match(update, /chain-check\.sh/u);
    assert.equal(update.match(/^\s*report$/gmu)?.length, 3);
    // Секрет читается только для проверки «задан ли» и для входа на Диск —
    // в журнал выката, видимый всем с доступом к репозиторию, он не идёт.
    const check = read('deploy/chain-check.sh').split('\n');
    for (const line of check) {
      if (!/PASSWORD|TOKEN|SECRET/u.test(line) || /^\s*#/u.test(line)) continue;
      assert.match(
        line,
        /\[ -[nz] "\$\(read_env [A-Z_]+\)" \]|^\s*pass=\$\(read_env YANDEX_DISK_PASSWORD\)$|^\s*(ok|off|bad) "/u,
        line,
      );
      // Строка отчёта называет переменную, но не подставляет значение.
      if (/^\s*(ok|off|bad) "/u.test(line)) assert.doesNotMatch(line, /\$\(read_env|\$pass|\$user/u, line);
    }
  });
});
