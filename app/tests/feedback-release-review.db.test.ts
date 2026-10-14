/**
 * Разбор отработанных замечаний миграцией на настоящей базе (решение
 * Р-583): «новое» становится «исправлено» с текстом и датой закрытия, в
 * журнал пишется разбор; разбор руководителя не перетирается; повторный
 * прогон ничего не меняет.
 *
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { after, describe, it } from 'node:test';

const enabled = Boolean(process.env.DATABASE_URL);

const SQL = readFileSync(
  path.join(import.meta.dirname, '..', 'prisma', 'migrations', '20261014130000_feedback_review_release', 'migration.sql'),
  'utf8',
);

describe('разбор отработанных замечаний миграцией', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');

  // Замечание выпуска 14.10 (дата — время выката), выпуска 09.10 (дата
  // слияния) и замечание, уже разобранное руководителем.
  const FRESH = 'cmv6i8zyq000701ln57l57ce8';
  const DATED = 'cmuzmca02000901lls898gb7z';
  const REVIEWED = 'cmuu7z9ga000701r5c5bcvyzq';
  const ids = [FRESH, DATED, REVIEWED];

  // На базе с настоящими замечаниями проверка их не трогает.
  const taken = await prisma.feedback.count({ where: { id: { in: ids } } });

  after(async () => {
    if (taken > 0) return;
    await prisma.auditEvent.deleteMany({ where: { objectType: 'Feedback', objectId: { in: ids } } });
    await prisma.feedback.deleteMany({ where: { id: { in: ids } } });
  });

  it('новые закрываются с текстом, датой и записью в журнал; разобранное остаётся', { skip: taken > 0 }, async () => {
    const base = {
      area: 'CABINET' as const,
      pathTemplate: '/cabinet/manage/tools',
      text: 'Проверка разбора миграцией',
      device: 'компьютер',
      viewportWidth: 1920,
      severityAuto: 'MEDIUM' as const,
      severity: 'MEDIUM' as const,
    };
    await prisma.feedback.create({ data: { ...base, id: FRESH } });
    await prisma.feedback.create({ data: { ...base, id: DATED, severity: 'HIGH' } });
    await prisma.feedback.create({
      data: { ...base, id: REVIEWED, status: 'REJECTED', note: 'Разобрано руководителем', resolvedAt: new Date('2026-10-10T10:00:00Z') },
    });

    const started = Date.now();
    await prisma.$executeRawUnsafe(SQL);

    const fresh = await prisma.feedback.findUniqueOrThrow({ where: { id: FRESH } });
    assert.equal(fresh.status, 'FIXED');
    assert.match(fresh.note ?? '', /^Р-572: /u);
    assert.ok(fresh.resolvedAt !== null);
    // Время выката записано в UTC, как пишет Prisma: не сдвинуто на пояс.
    assert.ok(Math.abs(fresh.resolvedAt.getTime() - started) < 120_000, fresh.resolvedAt.toISOString());

    const dated = await prisma.feedback.findUniqueOrThrow({ where: { id: DATED } });
    assert.equal(dated.status, 'FIXED');
    assert.equal(dated.severity, 'HIGH');
    assert.equal(dated.resolvedAt?.toISOString(), '2026-10-08T21:59:19.000Z');

    const reviewed = await prisma.feedback.findUniqueOrThrow({ where: { id: REVIEWED } });
    assert.equal(reviewed.status, 'REJECTED');
    assert.equal(reviewed.note, 'Разобрано руководителем');

    const events = await prisma.auditEvent.findMany({ where: { objectType: 'Feedback', objectId: { in: ids } } });
    assert.deepEqual(events.map((event) => event.objectId).sort(), [DATED, FRESH].sort());
    for (const event of events) {
      assert.equal(event.action, 'FEEDBACK_REVIEWED');
      assert.equal(event.actorId, null);
      const payload = event.payload as { status: { from: string; to: string }; severity: { from: string; to: string }; via: string };
      assert.deepEqual(payload.status, { from: 'NEW', to: 'FIXED' });
      assert.equal(payload.severity.from, payload.severity.to);
      assert.equal(payload.via, 'release');
    }
    assert.equal(
      (events.find((event) => event.objectId === DATED)!.payload as { severity: { to: string } }).severity.to,
      'HIGH',
    );

    // Повторный прогон: ни новых записей журнала, ни других дат.
    await prisma.$executeRawUnsafe(SQL);
    assert.equal(await prisma.auditEvent.count({ where: { objectType: 'Feedback', objectId: { in: ids } } }), 2);
    const again = await prisma.feedback.findUniqueOrThrow({ where: { id: FRESH } });
    assert.equal(again.resolvedAt?.getTime(), fresh.resolvedAt.getTime());
  });
});
