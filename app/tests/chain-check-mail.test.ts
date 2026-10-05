/**
 * Записи почтового домена в отчёте цепочки (улучшение УК-05, решение
 * Р-395): SPF, DMARC и DKIM проверяются, домен в отчёт не печатается.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const ROOT = path.join(import.meta.dirname, '..', '..');
const script = readFileSync(path.join(ROOT, 'deploy', 'chain-check.sh'), 'utf8');

describe('почтовый домен в отчёте цепочки (УК-05)', () => {
  it('проверяются SPF, DMARC и DKIM по селектору', () => {
    assert.match(script, /txt "\$domain" \| grep -q 'v=spf1'/u);
    assert.match(script, /txt "_dmarc\.\$domain" \| grep -q 'v=DMARC1'/u);
    assert.match(script, /txt "\$selector\._domainkey\.\$domain" \| grep -q 'p='/u);
  });
  it('домен отправителя в строки отчёта не попадает', () => {
    // Проверяется текст самих строк отчёта — то, что в кавычках после ok/off/bad.
    for (const match of script.matchAll(/\b(?:ok|off|bad) "([^"]*)"/gu)) {
      assert.doesNotMatch(match[1]!, /\$domain|\$sender|\$selector/u, match[1]);
    }
  });
  it('домен выделяется из «Имя <адрес>»', () => {
    const out = execFileSync('sh', ['-c', `printf '%s' 'ProDisser <info@prodisser.ru>' | sed -n 's/.*@\\([^>]*\\).*/\\1/p'`], {
      encoding: 'utf8',
    });
    assert.equal(out, 'prodisser.ru');
  });
});
