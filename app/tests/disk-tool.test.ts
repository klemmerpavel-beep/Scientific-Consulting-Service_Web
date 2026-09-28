import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const tool = readFileSync(path.resolve(import.meta.dirname, '../../tools/disk.mjs'), 'utf8');

/** Инструмент доступа к Диску из сессии разработки (решение Р-266). */
describe('tools/disk.mjs', () => {
  it('берёт доступ только из окружения и не печатает пароль', () => {
    assert.match(tool, /process\.env\.YANDEX_DISK_PASSWORD/u);
    for (const line of tool.split('\n')) {
      if (!/console\.(log|error)|fail\(/u.test(line)) continue;
      // Строка называет переменную, но не подставляет её значение.
      assert.doesNotMatch(line, /\$\{(PASSWORD|AUTH)\}|[(,+]\s*(PASSWORD|AUTH)\b/u, line);
    }
  });

  it('перед выкладкой сохраняет прежнюю версию и отказывает при чужой правке', () => {
    assert.match(tool, /'COPY'/u);
    assert.match(tool, /Архив\//u);
    assert.match(tool, /изменился на Диске после скачивания/u);
  });

  it('после выкладки запоминает новую версию: вторая своя правка не отказывает (Р-267)', () => {
    const put = tool.slice(tool.indexOf("command === 'put'"));
    assert.match(put, /etag: after\[0\]\.etag/u);
    assert.match(put, /writeFileSync\(etagFile/u);
  });
});
