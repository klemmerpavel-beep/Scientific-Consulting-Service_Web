/**
 * Разбор замечаний выгрузки 07.11.2026 миграцией на настоящей базе
 * (решение Р-832, порядок Р-583): «новое» становится «исправлено» с
 * текстом и датой закрытия или «в работе» без даты; в журнал пишется
 * разбор; разбор руководителя не перетирается; повторный прогон ничего не
 * меняет.
 *
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { after, describe, it } from 'node:test';

const enabled = Boolean(process.env.DATABASE_URL);

const SQL = readFileSync(
  path.join(import.meta.dirname, '..', 'prisma', 'migrations', '20261107190000_feedback_review_release_1107', 'migration.sql'),
  'utf8',
);

describe('разбор замечаний выгрузки 07.11.2026 миграцией', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');

  // Замечание выпуска 07.11 (дата — время выката), выпуска 18.10 (дата
  // слияния), замечание о фото («в работе») и разобранное руководителем.
  const FRESH = 'cmw4yoj5j000501qbj8noxgze';
  const DATED = 'cmvcvmj98000101mi2vdenffa';
  const PHOTO = 'cmuu41ec2000001r5lnf6b6i5';
  const REVIEWED = 'cmvcb7wv8000501p6upjh9yys';
  const ids = [FRESH, DATED, PHOTO, REVIEWED];

  // На базе с настоящими замечаниями проверка их не трогает.
  const taken = await prisma.feedback.count({ where: { id: { in: ids } } });

  after(async () => {
    if (taken > 0) return;
    await prisma.auditEvent.deleteMany({ where: { objectType: 'Feedback', objectId: { in: ids } } });
    await prisma.feedback.deleteMany({ where: { id: { in: ids } } });
  });

  it('новые разбираются с текстом, датой и записью в журнал; разобранное остаётся', { skip: taken > 0 }, async () => {
    const base = {
      area: 'SITE' as const,
      pathTemplate: '/main',
      text: 'Проверка разбора миграцией',
      device: 'компьютер',
      viewportWidth: 1920,
      severityAuto: 'MEDIUM' as const,
      severity: 'MEDIUM' as const,
    };
    await prisma.feedback.create({ data: { ...base, id: FRESH } });
    await prisma.feedback.create({ data: { ...base, id: DATED, severity: 'HIGH' } });
    await prisma.feedback.create({ data: { ...base, id: PHOTO } });
    await prisma.feedback.create({
      data: { ...base, id: REVIEWED, status: 'REJECTED', note: 'Разобрано руководителем', resolvedAt: new Date('2026-10-20T10:00:00Z') },
    });

    const started = Date.now();
    await prisma.$executeRawUnsafe(SQL);

    const fresh = await prisma.feedback.findUniqueOrThrow({ where: { id: FRESH } });
    assert.equal(fresh.status, 'FIXED');
    assert.match(fresh.note ?? '', /^Р-824: /u);
    assert.ok(fresh.resolvedAt !== null);
    assert.ok(Math.abs(fresh.resolvedAt.getTime() - started) < 120_000, fresh.resolvedAt.toISOString());

    const dated = await prisma.feedback.findUniqueOrThrow({ where: { id: DATED } });
    assert.equal(dated.status, 'FIXED');
    assert.equal(dated.severity, 'HIGH');
    assert.equal(dated.resolvedAt?.toISOString(), '2026-10-18T00:00:07.000Z');

    const photo = await prisma.feedback.findUniqueOrThrow({ where: { id: PHOTO } });
    assert.equal(photo.status, 'IN_WORK');
    assert.equal(photo.resolvedAt, null);
    assert.match(photo.note ?? '', /^Р-827: /u);

    const reviewed = await prisma.feedback.findUniqueOrThrow({ where: { id: REVIEWED } });
    assert.equal(reviewed.status, 'REJECTED');
    assert.equal(reviewed.note, 'Разобрано руководителем');

    const events = await prisma.auditEvent.findMany({ where: { objectType: 'Feedback', objectId: { in: ids } } });
    assert.deepEqual(events.map((event) => event.objectId).sort(), [DATED, FRESH, PHOTO].sort());
    for (const event of events) {
      assert.equal(event.action, 'FEEDBACK_REVIEWED');
      assert.equal(event.actorId, null);
      const payload = event.payload as { status: { to: string }; via: string };
      assert.equal(payload.via, 'release');
      assert.equal(payload.status.to, event.objectId === PHOTO ? 'IN_WORK' : 'FIXED');
    }

    // Повторный прогон ничего не меняет.
    await prisma.$executeRawUnsafe(SQL);
    assert.equal(await prisma.auditEvent.count({ where: { objectType: 'Feedback', objectId: { in: ids } } }), 3);
  });
});
