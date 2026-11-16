/**
 * Разбор замечаний выгрузки 16.11.2026 миграцией на настоящей базе
 * (решение Р-952, порядок Р-583 и Р-832): «новое» становится «исправлено» с
 * текстом и датой закрытия; в журнал пишется разбор; разбор руководителя не
 * перетирается; повторный прогон ничего не меняет.
 *
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { after, describe, it } from 'node:test';

const enabled = Boolean(process.env.DATABASE_URL);

const SQL = readFileSync(
  path.join(import.meta.dirname, '..', 'prisma', 'migrations', '20261116200000_feedback_review_release_1116', 'migration.sql'),
  'utf8',
);

describe('разбор замечаний выгрузки 16.11.2026 миграцией', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');

  // Просветы между разделами — «новое»; портреты — уже разобрано руководителем.
  const FRESH = 'cmwgwyrz1000001pgvzwy47p8';
  const REVIEWED = 'cmw6x7z1d000001n3o2fmmiru';
  const ids = [FRESH, REVIEWED];

  // На базе с настоящими замечаниями проверка их не трогает.
  const taken = await prisma.feedback.count({ where: { id: { in: ids } } });

  after(async () => {
    if (taken > 0) return;
    await prisma.auditEvent.deleteMany({ where: { objectType: 'Feedback', objectId: { in: ids } } });
    await prisma.feedback.deleteMany({ where: { id: { in: ids } } });
  });

  it('новое разбирается с текстом, датой и записью в журнал; разобранное остаётся', { skip: taken > 0 }, async () => {
    const base = {
      area: 'SITE' as const,
      pathTemplate: '/',
      text: 'Проверка разбора миграцией',
      device: 'компьютер',
      viewportWidth: 1920,
      severityAuto: 'MEDIUM' as const,
      severity: 'MEDIUM' as const,
    };
    await prisma.feedback.create({ data: { ...base, id: FRESH, severity: 'HIGH' } });
    await prisma.feedback.create({
      data: { ...base, id: REVIEWED, status: 'REJECTED', note: 'Разобрано руководителем', resolvedAt: new Date('2026-11-10T10:00:00Z') },
    });

    const started = Date.now();
    await prisma.$executeRawUnsafe(SQL);

    const fresh = await prisma.feedback.findUniqueOrThrow({ where: { id: FRESH } });
    assert.equal(fresh.status, 'FIXED');
    assert.equal(fresh.severity, 'HIGH');
    assert.match(fresh.note ?? '', /^Р-946, Р-950: /u);
    assert.ok(fresh.resolvedAt !== null);
    assert.ok(Math.abs(fresh.resolvedAt.getTime() - started) < 120_000, fresh.resolvedAt.toISOString());

    const reviewed = await prisma.feedback.findUniqueOrThrow({ where: { id: REVIEWED } });
    assert.equal(reviewed.status, 'REJECTED');
    assert.equal(reviewed.note, 'Разобрано руководителем');

    const events = await prisma.auditEvent.findMany({ where: { objectType: 'Feedback', objectId: { in: ids } } });
    assert.deepEqual(events.map((event) => event.objectId), [FRESH]);
    assert.equal(events[0]!.action, 'FEEDBACK_REVIEWED');
    assert.equal(events[0]!.actorId, null);
    const payload = events[0]!.payload as { status: { to: string }; via: string };
    assert.equal(payload.via, 'release');
    assert.equal(payload.status.to, 'FIXED');

    // Повторный прогон ничего не меняет.
    await prisma.$executeRawUnsafe(SQL);
    assert.equal(await prisma.auditEvent.count({ where: { objectType: 'Feedback', objectId: { in: ids } } }), 1);
  });
});
