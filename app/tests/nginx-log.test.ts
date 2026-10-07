/**
 * Журнал доступа nginx не хранит ключ ссылки входа (решение Р-430).
 *
 * Проверяется текст конфигурации: nginx в проверках не запускается.
 * Работу формата проверяли на стенде с `nginx -t` и запросами к
 * /cabinet/enter/<ключ> — в журнал легло «/cabinet/enter/-».
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const conf = readFileSync(path.join(import.meta.dirname, '..', '..', 'deploy', 'nginx.conf'), 'utf8');

/** Тело блока location по его заголовку. */
function block(head: string): string {
  const start = conf.indexOf(head);
  assert.ok(start >= 0, `нет блока ${head}`);
  return conf.slice(start, conf.indexOf('\n    }', start));
}

describe('журнал доступа кабинета (Р-430)', () => {
  it('путь ссылки входа в журнале заменён, строка запроса не пишется', () => {
    assert.match(conf, /map \$uri \$prodisser_cabinet_uri \{\s*"~\^\/cabinet\/enter\/" "\/cabinet\/enter\/-";\s*default\s+\$uri;/u);
    assert.match(conf, /log_format prodisser_cabinet [^;]*\$prodisser_cabinet_uri[^;]*;/u);
    assert.doesNotMatch(conf.match(/log_format prodisser_cabinet [^;]*;/u)![0], /\$request\b|\$request_uri|\$args/u);
  });

  it('кабинет и крупные загрузки пишут журнал этим форматом', () => {
    for (const head of ['location /cabinet {', 'location ^~ /__cabinet_upload/ {']) {
      assert.match(block(head), /access_log \/var\/log\/nginx\/access\.log prodisser_cabinet;/u, head);
    }
  });
});
