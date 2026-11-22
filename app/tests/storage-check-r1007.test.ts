/**
 * Сверка вложений заявок и файлов анкет экспертов с хранилищем без базы
 * (ответ владельца 22.11.2026 «Расширить в выпуске 4»; решение Р-1007):
 * сравнение строк с объектами по двум видам, срок еженедельной чистки из
 * расписания, владелец по ключу, подписи, состав выборки и экран.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import {
  compareFiles,
  LEAD_PURGE_GRACE_DAYS,
  ownerOfKey,
  PURGE_PERIOD_DAYS,
  purgeDeadline,
  STORAGE_GAP_KINDS,
  STORAGE_SECTION_KINDS,
  STORAGE_SECTION_PREFIX,
  STORAGE_SECTIONS,
  storageGapLabel,
  type FileRow,
} from '../src/lib/cabinet/storage-gaps.ts';

const APP = path.join(import.meta.dirname, '..');
const ROOT = path.join(APP, '..');
const DAY = 24 * 60 * 60 * 1000;
const at = new Date('2026-12-05T10:00:00Z');
const row = (id: string, key: string, purgedAt: Date | null = null): FileRow => ({ id, storageKey: key, purgedAt });
const object = (key: string) => ({ key, sizeBytes: 3, modifiedAt: at });
const ago = (days: number, ms = 0) => new Date(at.getTime() - days * DAY - ms);

describe('сверка вложений и анкет: сравнение (Р-1007)', () => {
  it('всё сходится — строка с файлом и изъятое вложение без файла расхождений не дают', () => {
    const live = 'leads/l1/a.pdf';
    assert.deepEqual(compareFiles([row('a', live), row('b', 'leads/l1/b.pdf', ago(30))], [object(live)], purgeDeadline(at)), []);
  });

  it('файл без записи — сирота; есть расхождение и нет', () => {
    const gaps = compareFiles([row('a', 'experts/e1/a.pdf')], [object('experts/e1/a.pdf'), object('experts/e1/z.pdf')], purgeDeadline(at));
    assert.deepEqual(gaps.map((gap) => [gap.kind, gap.key, gap.row]), [['ORPHAN', 'experts/e1/z.pdf', null]]);
  });

  it('изъятое или перенесённое вложение с файлом — расхождение только после срока чистки', () => {
    const key = 'leads/l1/moved.pdf';
    const check = (purgedAt: Date) => compareFiles([row('m', key, purgedAt)], [object(key)], purgeDeadline(at)).map((gap) => gap.kind);
    assert.deepEqual(check(ago(1)), [], 'изъято вчера — ждёт чистки');
    assert.deepEqual(check(ago(7)), [], 'неделя — чистка могла ещё не дойти');
    assert.deepEqual(check(ago(LEAD_PURGE_GRACE_DAYS, -1000)), [], 'за секунду до срока');
    assert.deepEqual(check(ago(LEAD_PURGE_GRACE_DAYS)), ['PURGED_KEPT'], 'ровно срок');
    assert.deepEqual(check(ago(30)), ['PURGED_KEPT']);
  });

  it('изъятое вложение с ключом вне префикса ищется поштучно', () => {
    const key = 'legacy/old.pdf';
    assert.deepEqual(compareFiles([row('o', key, ago(9))], [], purgeDeadline(at), new Map([[key, { sizeBytes: 3, modifiedAt: at }]]))[0]?.kind, 'PURGED_KEPT');
    assert.deepEqual(compareFiles([row('o', key, ago(9))], [], purgeDeadline(at), new Map([[key, null]])), []);
  });

  it('у анкет вид один: строка файла не изымается, остаётся только сирота', () => {
    assert.deepEqual(STORAGE_SECTION_KINDS.EXPERTS, ['ORPHAN']);
    assert.deepEqual(STORAGE_SECTION_KINDS.LEADS, ['PURGED_KEPT', 'ORPHAN']);
    assert.deepEqual(STORAGE_SECTION_KINDS.MATERIALS, STORAGE_GAP_KINDS);
  });

  it('владелец файла — по ключу раздела; чужой и вложенный ключ — нет', () => {
    assert.equal(ownerOfKey('LEADS', 'leads/cl1/0b6e.pdf'), 'cl1');
    assert.equal(ownerOfKey('EXPERTS', 'experts/ce1/0b6e.docx'), 'ce1');
    assert.equal(ownerOfKey('LEADS', 'experts/ce1/0b6e.docx'), null);
    assert.equal(ownerOfKey('LEADS', 'leads/cl1/a/b.pdf'), null);
    assert.equal(ownerOfKey('EXPERTS', 'projects/p/materials/m/v1/a'), null);
  });

  it('у каждого раздела и вида — своя подпись; разделы — три префикса, временных документов нет', () => {
    const labels = STORAGE_SECTIONS.flatMap((section) => STORAGE_SECTION_KINDS[section].map((kind) => storageGapLabel(section, kind)));
    assert.equal(new Set(labels).size, labels.length, 'подписи различаются');
    assert.ok(labels.every((label) => label.length > 0));
    assert.equal(storageGapLabel('LEADS', 'ORPHAN'), 'файл без записи вложения');
    assert.equal(storageGapLabel('EXPERTS', 'ORPHAN'), 'файл без записи анкеты');
    assert.equal(storageGapLabel('LEADS', 'PURGED_KEPT'), 'вложение изъято или перенесено, файл остался');
    assert.deepEqual(Object.values(STORAGE_SECTION_PREFIX), ['projects/', 'leads/', 'experts/']);
  });
});

describe('срок чистки изъятых вложений — из расписания и retention.sh (Р-1007)', () => {
  it('чистка стоит в расписании раз в неделю; срок — неделя и сутки запаса', () => {
    const cron = readFileSync(path.join(ROOT, 'deploy', 'cron-sync.sh'), 'utf8');
    const line = cron.split('\n').find((text) => /\$DIR\/retention\.sh/u.test(text) && !/^\s*#/u.test(text));
    assert.ok(line !== undefined, 'retention.sh в расписании');
    const [minute, hour, dom, month, dow] = line.trim().split(/\s+/u);
    assert.deepEqual([minute, hour, dom, month], ['30', '3', '*', '*']);
    assert.match(dow!, /^[0-7]$/u, 'один день недели — раз в 7 суток');
    assert.equal(PURGE_PERIOD_DAYS, 7);
    assert.equal(LEAD_PURGE_GRACE_DAYS, 8);
    assert.equal(at.getTime() - purgeDeadline(at).getTime(), 8 * DAY);
  });

  it('чистка повторяет удаление объектов изъятых вложений, а файлы анкет выбирает по строкам', () => {
    const retention = readFileSync(path.join(ROOT, 'deploy', 'retention.sh'), 'utf8');
    assert.match(retention, /SQL_PURGED_KEYS=.*FROM \\"LeadAttachment\\" WHERE \\"purgedAt\\" IS NOT NULL/u);
    assert.match(retention, /SQL_EXPERT_KEYS=.*FROM \\"ExpertApplicationFile\\" f JOIN \\"ExpertApplication\\"/u);
    assert.match(retention, /find "\$DIR\/storage\/briefs" -type f -mmin \+1440/u, 'временные документы — через сутки');
  });
});

describe('выборка, отчёт и экран: без персональных данных (Р-1007)', () => {
  const service = readFileSync(path.join(APP, 'src/lib/cabinet/storage-check.ts'), 'utf8');

  it('сверка обходит три префикса, временные документы — нет; только читает', () => {
    assert.deepEqual([...service.matchAll(/await listUnder\((\w+)\)/gu)].map((m) => m[1]), ['MATERIAL_PREFIX', 'LEAD_PREFIX', 'EXPERT_PREFIX']);
    assert.doesNotMatch(service, /briefs/u);
    assert.doesNotMatch(service, /\.(?:remove|put|delete|deleteMany|update|updateMany|upsert|create|createMany)\(/u);
    assert.match(service, /const deadline = purgeDeadline\(at\);/u);
  });

  it('из базы берутся номер заявки и дата анкеты — ни ФИО, ни контактов, ни имён файлов', () => {
    const selects = [...service.matchAll(/select: \{[^\n]*\}/gu)].map((m) => m[0]).join('\n');
    assert.match(service, /db\.leadAttachment\.findMany\(\{[\s\S]*?select: \{ id: true, storageKey: true, purgedAt: true, lead: \{ select: \{ id: true, number: true \} \} \}/u);
    assert.match(service, /db\.expertApplicationFile\.findMany\(\{[\s\S]*?select: \{ id: true, storageKey: true, application: \{ select: \{ id: true, createdAt: true \} \} \}/u);
    assert.match(service, /db\.lead\.findMany\(\{ where: \{ id: \{ in: leadIds \} \}, select: \{ id: true, number: true \} \}\)/u);
    assert.match(service, /db\.expertApplication\.findMany\(\{ where: \{ id: \{ in: applicationIds \} \}, select: \{ id: true, createdAt: true \} \}\)/u);
    assert.doesNotMatch(selects, /fullName|email|phone|contact|name: true|originalName/u);
  });

  it('«Сводка»: разделы вложений и анкет — номер заявки и дата анкеты, без кнопок и форм', () => {
    const page = readFileSync(path.join(APP, 'src/app/cabinet/manage/page.tsx'), 'utf8');
    const block = page.slice(page.indexOf('<Block id="storage"'), page.indexOf('</Block>', page.indexOf('<Block id="storage"')));
    assert.match(block, /STORAGE_SECTIONS\.map\(\(section\) =>/u);
    assert.match(block, /section === 'LEADS' \? 'Заявка' : 'Анкета'/u);
    assert.match(block, /Расхождений нет — сверены версии материалов, вложения заявок и файлы анкет кандидатов\./u);
    assert.doesNotMatch(block, /<Form|<Button|<form|action=|Удалить|удалить</u);
    const owner = page.slice(page.indexOf('function storageOwner('), page.indexOf('\n}\n', page.indexOf('function storageOwner(')));
    assert.match(owner, /leadNumberLabel\(row\.lead\.number\)/u);
    assert.match(owner, /formatDay\(row\.application\.createdAt\)/u);
    assert.doesNotMatch(owner, /fullName|email|contact|name\b/u);
    // Перечень — из службы, отвечающей только руководителю; ключа в строке нет.
    const head = readFileSync(path.join(APP, 'src/lib/cabinet/head-checks.ts'), 'utf8');
    const fn = head.slice(head.indexOf('export async function storageGaps('));
    const mapped = fn.slice(fn.indexOf('rows: check.gaps.map('), fn.indexOf('})),'));
    assert.deepEqual([...mapped.matchAll(/^\s+(\w+):/gmu)].map((m) => m[1]), ['section', 'kind', 'label', 'material', 'work', 'version', 'lead', 'application', 'at']);
  });
});
