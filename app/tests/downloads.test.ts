/**
 * Выдача файлов раздела материалов (решение Р-554): шаблоны — всем ролям,
 * незнакомый ключ и приостановленная запись — «не найдено».
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';
import { BRIEF_TEMPLATES } from '../src/lib/cabinet/brief/templates.ts';
import { DOWNLOAD_HREF, download } from '../src/lib/cabinet/downloads.ts';

const actor = (role: Actor['role'], status: Actor['status'] = 'ACTIVE'): Actor => ({
  id: `u-${role}`,
  role,
  status,
  clientProfileId: role === 'CLIENT' ? 'c-1' : null,
  expertNdaSignedAt: null,
});

describe('выдача файлов материалов (Р-554)', () => {
  it('шаблоны выдаются каждой роли', () => {
    for (const role of ['CLIENT', 'EXPERT', 'MANAGER', 'HEAD'] as const) {
      for (const template of BRIEF_TEMPLATES) {
        const item = download(actor(role), template.key);
        assert.ok(item !== null, `${role}: ${template.key}`);
        assert.equal(item.file, template.file);
        assert.ok(item.bytes.length > 0);
      }
    }
  });

  it('незнакомый ключ и приостановленная запись — «не найдено»', () => {
    assert.equal(download(actor('HEAD'), 'nope'), null);
    assert.equal(download(actor('HEAD', 'SUSPENDED'), BRIEF_TEMPLATES[0]!.key), null);
  });

  it('маршрут выдачи и обход прототипа согласованы', () => {
    const route = readFileSync(path.join(import.meta.dirname, '..', 'src', 'app', 'cabinet', 'downloads', '[file]', 'route.ts'), 'utf8');
    assert.match(route, /download\(actor,/u);
    assert.equal(DOWNLOAD_HREF, '/cabinet/downloads');
    const crawl = readFileSync(path.join(import.meta.dirname, '..', '..', 'tools', 'cabinet-prototype.mjs'), 'utf8');
    assert.match(crawl, /\/\^\\\/cabinet\\\/downloads\\b\/u/u, 'обход прототипа скачивал бы файлы как страницы');
  });
});
