/**
 * Материалы для всех ролей (указание владельца 12.10.2026, решение
 * Р-555): кому что видно и что скачивается.
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';
import { checklistsDocx, serviceChecklistsDocx } from '../src/lib/cabinet/checklist-docs.ts';
import { readBrief } from '../src/lib/cabinet/brief/read.ts';
import { DOWNLOAD_HREF, download } from '../src/lib/cabinet/downloads.ts';
import { clientMaterials, staffMaterials } from '../src/lib/cabinet/materials-hub.ts';
import { CLIENT_MEMO } from '../src/lib/cabinet/memos.ts';

const actor = (role: Actor['role']): Actor => ({
  id: `u-${role}`,
  role,
  status: 'ACTIVE',
  clientProfileId: role === 'CLIENT' ? 'c-1' : null,
  expertNdaSignedAt: null,
});

const SRC = path.join(import.meta.dirname, '..', 'src');
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === 'generated' ? [] : sources(full);
    return /\.tsx?$/u.test(name) && !full.endsWith(path.join('lib', 'cabinet', 'memos.ts')) ? [full] : [];
  });
}

describe('материалы по ролям (Р-555)', () => {
  it('клиенту — шаблоны и памятка, без чек-листов команды', async () => {
    const rows = clientMaterials();
    const files = rows.flatMap((row) => row.files.map((file) => file.href));
    assert.ok(files.some((href) => href.endsWith('/anketa-docx')));
    assert.ok(files.some((href) => href.endsWith(`/${CLIENT_MEMO.key}`)));
    assert.ok(!files.some((href) => href.includes('chek-listy')));
    for (const href of files) assert.ok((await download(actor('CLIENT'), href.split('/').pop()!)) !== null, href);
    assert.equal(await download(actor('CLIENT'), 'chek-listy'), null, 'чек-листы команды клиенту не выдаются');
    assert.equal(await download(actor('CLIENT'), 'chek-listy-po-vidam'), null);
  });

  it('сотрудникам — чек-листы, по видам работ, шаблоны и памятка; каждый файл выдаётся', async () => {
    for (const role of ['EXPERT', 'MANAGER', 'HEAD'] as const) {
      const rows = staffMaterials(actor(role));
      assert.ok(rows.some((row) => row.href === '/cabinet/manage/checklists'), role);
      for (const row of rows) {
        for (const file of row.files) assert.ok((await download(actor(role), file.href.split('/').pop()!)) !== null, `${role}: ${file.href}`);
      }
    }
    assert.deepEqual(staffMaterials(actor('CLIENT')), []);
  });

  it('шаблоны практики (Р-558): клиенту — строкой каждый, сотрудникам — общей строкой', () => {
    const contract = { id: 'ctpl0000001', title: 'Договор', note: null, originalName: 'Договор.DOCX' };
    const memo = { id: 'ctpl0000002', title: 'Памятка', note: 'Перед стартом', originalName: 'памятка' };
    const client = clientMaterials([memo]);
    assert.deepEqual(client.at(-1), { title: 'Памятка', note: 'Перед стартом', files: [{ href: `${DOWNLOAD_HREF}/tpl-ctpl0000002`, label: 'Скачать' }] });

    const staff = staffMaterials(actor('MANAGER'), [contract, memo]).find((row) => row.title === 'Шаблоны практики');
    assert.deepEqual(staff?.files.map((file) => file.label), ['Договор, .docx', 'Памятка']);
    // Пустая строка — только руководителю: оттуда он идёт к загрузке.
    assert.ok(staffMaterials(actor('HEAD')).some((row) => row.title === 'Шаблоны практики'));
    assert.ok(!staffMaterials(actor('MANAGER')).some((row) => row.title === 'Шаблоны практики'));
  });

  it('файл чек-листов — свои чек-листы роли, каждый шаг с квадратом', () => {
    const curator = readBrief(checklistsDocx(actor('EXPERT'))).lines.map((line) => line.text);
    assert.ok(curator.includes('Приём назначенной работы'));
    assert.ok(!curator.some((text) => text.startsWith('Неделя руководителя')), 'куратору — не чек-листы руководителя');
    assert.ok(curator.filter((text) => text.startsWith('☐ ')).length >= 10);
    const head = readBrief(checklistsDocx(actor('HEAD'))).lines.map((line) => line.text);
    assert.ok(head.some((text) => text.startsWith('Неделя руководителя — руководителю')));
    const service = readBrief(serviceChecklistsDocx(actor('MANAGER'))).lines.map((line) => line.text);
    assert.ok(service.includes('Сопровождение диссертационного исследования'));
    assert.ok(service.includes('Сдача:'));
  });

  it('кнопки, названные в памятке клиенту, на экранах есть', () => {
    const code = sources(SRC).map((file) => readFileSync(file, 'utf8')).join('\n');
    const quoted = CLIENT_MEMO.points.flatMap((point) => [...point.matchAll(/«([^»]+)»/gu)].map((match) => match[1]!));
    assert.ok(quoted.length >= 8);
    for (const label of quoted) assert.ok(code.includes(label), `на экранах нет «${label}»`);
  });
});
