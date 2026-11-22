/**
 * Действия с файлами хранилища — строка журнала в транзакции действия,
 * файл по своему порядку (план доработки 19.11.2026, К-6; решение
 * Р-1006): загрузка версии, перенос вложений заявки, документ исходных
 * данных — файл первым, затем одна транзакция, отказ убирает файл;
 * удаление анкеты и исполнение требования об удалении — одна транзакция,
 * затем удаление объектов, сбой удаления действие не откатывает.
 *
 * Опись всего `lib/cabinet` — в тесте Р-967 (`journal-tx-r967.test.ts`):
 * после этого решения вне транзакции остаётся только класс «а». Здесь —
 * порядок операций в каждом из пяти действий и поведение общих помощников
 * хранилища. На базе — `journal-tx-r1006.db.test.ts`.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { detailsLabel, isRecordId } from '../src/lib/cabinet/journal-labels.ts';
import { newRowId, removeObjects, undoObjectsOnFailure, type Storage } from '../src/lib/cabinet/storage.ts';

const LIB = path.join(import.meta.dirname, '../src/lib/cabinet');
const read = (file: string) => readFileSync(path.join(LIB, file), 'utf8');

/** Тело функции от объявления до закрывающей скобки в начале строки. */
function body(file: string, fn: string): string {
  const source = read(file);
  const start = source.search(new RegExp(`^(?:export )?async function ${fn}\\(`, 'mu'));
  assert.ok(start >= 0, `${file}: нет функции ${fn}`);
  return source.slice(start, source.indexOf('\n}\n', start));
}

/** Места фрагментов в тексте — по порядку; каждый обязан найтись. */
function order(text: string, parts: readonly string[], label: string): void {
  let at = -1;
  for (const part of parts) {
    const next = text.indexOf(part, at + 1);
    assert.ok(next > at, `${label}: «${part}» не на своём месте`);
    at = next;
  }
}

/** Конец транзакции, открытой строкой `open`, — строка `});` с её отступом. */
function txEnd(text: string, open: string): number {
  const start = text.indexOf(open);
  assert.ok(start >= 0, `нет «${open}»`);
  const indent = /[^\n]*$/u.exec(text.slice(0, start))![0].match(/^\s*/u)![0];
  const end = text.indexOf(`\n${indent}});`, start);
  assert.ok(end > start);
  return end;
}

/** Хранилище в памяти, которое может отказать в удалении. */
function memory(failRemove = false): Storage & { readonly objects: Map<string, Buffer> } {
  const objects = new Map<string, Buffer>();
  return {
    objects,
    put: async (key, body) => {
      objects.set(key, body);
      return { key, sizeBytes: body.byteLength, sha256: '' };
    },
    get: async (key) => objects.get(key)!,
    remove: async (key) => {
      if (failRemove) throw new Error('отказ диска');
      objects.delete(key);
    },
    signedUrl: async () => null,
  };
}

describe('действия с файлами: журнал в транзакции, файл по порядку (Р-1006)', () => {
  it('создание: загрузка версии — проверки, файл, затем одна транзакция; отказ убирает файл', () => {
    const upload = body('materials.ts', 'uploadVersion');
    order(
      upload,
      ['await planUpload(actor, input)', 'await nextSlot(plan)', 'await store.put(slot.key', 'undoObjectsOnFailure(store, [slot.key]', 'prisma.$transaction((tx) => writeVersion(tx, actor, plan, slot, ip))'],
      'uploadVersion',
    );
    // Номер занят другой загрузкой — повтор со следующим, не больше трёх раз.
    assert.match(upload, /if \(attempt < UPLOAD_ATTEMPTS && numberTaken\(error\)\) continue;/u);
    // Проверки ничего не пишут: ни в базу, ни в хранилище.
    const plan = body('materials.ts', 'planUpload');
    assert.doesNotMatch(plan, /\.(?:create|update|upsert|delete)\w*\(|storage\(\)|\.put\(/u);
  });

  it('создание: строки версии, письма, журнал доступа и строка журнала — только соединением транзакции', () => {
    const write = body('materials.ts', 'writeVersion');
    assert.match(write, /tx: Prisma\.TransactionClient,/u);
    assert.doesNotMatch(write, /\bprisma\./u, 'запись мимо транзакции');
    for (const call of [
      'await tx.materialVersion.create(',
      'await tx.fileAccessLog.create(',
      'await enqueue(tx, {',
      "action: 'VERSION_UPLOADED'",
      'await closeActChecks(tx, input.projectId, actor.id)',
    ]) {
      assert.ok(write.includes(call), `writeVersion: нет ${call}`);
    }
    assert.match(write, /\}, tx\);\n\s+\/\/ Акт по работе/u, 'строка журнала — соединением транзакции');
    // Номер сверяется внутри транзакции: занятый — отказ и повтор.
    order(write, ['await tx.materialVersion.findFirst(', 'throw new VersionNumberTaken(', 'await tx.materialVersion.create('], 'writeVersion');
  });

  it('создание: перенос вложений заявки — копии, одна транзакция с отметками и строкой, исходные объекты после неё', () => {
    const move = read('projects.ts').slice(read('projects.ts').indexOf('async function moveLeadAttachments('));
    const text = move.slice(0, move.indexOf('\n}\n'));
    order(
      text,
      [
        'await store.put(key, await store.get(file.storageKey)',
        'await undoObjectsOnFailure(store, copies.map((copy) => copy.key)',
        'await prisma.$transaction(async (tx) => {',
        'await tx.material.create(',
        'await tx.materialVersion.create(',
        'await tx.leadAttachment.updateMany(',
        "action: 'LEAD_FILES_MOVED'",
        '}, tx);',
        "await removeObjects(store, copies.map((copy) => copy.file.storageKey), 'исходный объект",
      ],
      'moveLeadAttachments',
    );
    assert.doesNotMatch(text, /\bprisma\.(?!\$transaction)\w+\.(?:create|update|upsert|delete)\w*\(/u, 'запись мимо транзакции');
    assert.doesNotMatch(text, /store\.remove\(/u, 'удаление объекта мимо порядка');
  });

  it('создание: документ исходных данных — правка карточки, карточка клиента, версия и три строки журнала одной транзакцией', () => {
    const apply = body('brief/work-apply.ts', 'applyWorkBrief');
    order(
      apply,
      [
        'await planProjectEdit(actor, {',
        'await planUpload(actor, doc.upload)',
        'await store.put(slot.key',
        'await undoObjectsOnFailure(store,',
        'await prisma.$transaction(async (tx) => {',
        'await writeProjectEdit(tx, actor, edit)',
        'await tx.clientProfile.updateMany(',
        'await writeVersion(tx, actor, upload, slot, ip)',
        "action: 'BRIEF_APPLIED'",
        '}, tx);',
        "await removeObjects(store, [doc.key], 'временный объект",
      ],
      'applyWorkBrief',
    );
    assert.doesNotMatch(apply, /\beditProject\(|attachBrief\(|\bprisma\.(?!\$transaction)\w+\.(?:create|update|upsert|delete)\w*\(/u);
    // Правка карточки с формы — те же проверки и та же запись.
    const edit = body('projects.ts', 'editProject');
    assert.match(edit, /const plan = await planProjectEdit\(actor, input\);\n\s+return prisma\.\$transaction\(\(tx\) => writeProjectEdit\(tx, actor, plan\)\);/u);
    assert.doesNotMatch(body('projects.ts', 'writeProjectEdit'), /\bprisma\./u);
  });

  it('удаление: анкета — строки и строка журнала одной транзакцией, объекты после фиксации', () => {
    const text = body('expert-applications.ts', 'deleteExpertApplication');
    order(
      text,
      [
        'const keys = await prisma.$transaction(async (tx) => {',
        'await tx.expertApplication.deleteMany(',
        "action: 'EXPERT_APPLICATION_DELETED'",
        '}, tx);',
        "await removeObjects(storage(), keys, 'файл удалённой анкеты",
      ],
      'deleteExpertApplication',
    );
    assert.doesNotMatch(text, /storage\(\)\.remove\(/u);
    assert.ok(text.indexOf('removeObjects(') > txEnd(text, 'const keys = await prisma.$transaction(async (tx) => {'));
  });

  it('удаление: требование субъекта — затирание, журнал доступа, отчёт и строка журнала одной транзакцией, объекты после фиксации', () => {
    const text = body('erasure.ts', 'executeErasure');
    const open = 'const report = await prisma.$transaction(async (tx) => {';
    const end = txEnd(text, open);
    const inside = text.slice(text.indexOf(open), end);
    order(
      inside,
      [
        'await tx.erasureRequest.updateMany(',
        'purgedVersions = await tx.materialVersion.updateMany(',
        'await tx.fileAccessLog.createMany(',
        'await tx.erasureRequest.update(',
        "action: 'ERASURE_EXECUTED'",
        '}, tx);',
      ],
      'executeErasure',
    );
    // Ни одного удаления объекта до фиксации и ни одной записи мимо неё.
    assert.doesNotMatch(text, /storage\(\)\.remove\(|prisma\.fileAccessLog\.create/u);
    assert.ok(text.indexOf('await removeObjects(storage(), objects,') > end, 'объекты удаляются до фиксации');
  });

  it('строка журнала об удалении данных не хранит удаляемых персональных данных', () => {
    const text = body('erasure.ts', 'executeErasure');
    const at = text.indexOf("action: 'ERASURE_EXECUTED'");
    const payload = text.slice(text.indexOf('payload: {', at), text.indexOf('}, tx);', at));
    const keys = [...payload.matchAll(/^\s+(\w+):/gmu)].map((match) => match[1]).sort();
    // Идентификатор карточки, числа и сумма договоров (учёт): ни ФИО, ни
    // контактов, ни имён файлов, ни ключей объектов.
    assert.deepEqual(keys, ['clientId', 'contractTotal', 'files', 'projects']);
    assert.match(
      detailsLabel({ clientId: newRowId(), projects: 2, files: 7, contractTotal: '24000050' }, 'ERASURE_EXECUTED'),
      /^работ 2 · файлов 7 · сумма договоров 240\s000,50\s₽$/u,
    );
  });

  it('помощник создания: отказ записи убирает объекты и передаёт исходную ошибку, даже если уборка не удалась', async () => {
    const store = memory();
    await store.put('a', Buffer.from('1'), 'text/plain');
    await assert.rejects(undoObjectsOnFailure(store, ['a'], () => Promise.reject(new Error('сбой журнала'))), /сбой журнала/u);
    assert.equal(store.objects.has('a'), false);
    await store.put('b', Buffer.from('2'), 'text/plain');
    assert.equal(await undoObjectsOnFailure(store, ['b'], async () => 'ok'), 'ok');
    assert.equal(store.objects.has('b'), true, 'объект убран при удачной записи');

    const stuck = memory(true);
    await stuck.put('c', Buffer.from('3'), 'text/plain');
    const logged: unknown[][] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => void logged.push(args);
    try {
      await assert.rejects(undoObjectsOnFailure(stuck, ['c'], () => Promise.reject(new Error('сбой журнала'))), /сбой журнала/u);
    } finally {
      console.error = original;
    }
    assert.equal(stuck.objects.has('c'), true);
    assert.ok(logged.some((args) => args.includes('c')), 'ключ неубранного объекта — в журнал сервера');
  });

  it('помощник удаления: сбой не бросает, считается и уходит в журнал сервера с ключом', async () => {
    const store = memory();
    await store.put('a', Buffer.from('1'), 'text/plain');
    assert.equal(await removeObjects(store, ['a', 'нет такого'], 'не удалён'), 0);
    const stuck = memory(true);
    await stuck.put('b', Buffer.from('2'), 'text/plain');
    const logged: unknown[][] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => void logged.push(args);
    try {
      assert.equal(await removeObjects(stuck, ['b', 'c'], 'не удалён'), 2);
    } finally {
      console.error = original;
    }
    assert.deepEqual(logged.map((args) => args[1]), ['b', 'c']);
  });

  it('заданный заранее идентификатор материала — вида `cuid`, неповторяющийся', () => {
    const made = Array.from({ length: 2000 }, () => newRowId());
    for (const id of made.slice(0, 20)) assert.ok(isRecordId(id), id);
    assert.equal(new Set(made).size, made.length);
  });
});
