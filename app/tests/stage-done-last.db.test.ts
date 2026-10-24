/**
 * Закрытый последний этап (решение Р-710): «Что сделать сейчас» не
 * советует проверить следующий этап, когда следующего нет.
 *
 * Прежде у закрытого этапа стояла одна строка — «Проверьте, что следующий
 * начат и у него есть срок», — и на этапе 3 из 3 она расходилась с экраном
 * работы, где написано «Все этапы завершены». У последнего этапа теперь
 * своя подсказка: проверить оплату и завершить работу.
 *
 * Часть на базе пропускается без заданного адреса базы; запускается
 * `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 'n'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);
const stamp = Date.now();

const page = readFileSync(
  path.join(import.meta.dirname, '..', 'src', 'app', 'cabinet', 'stages', '[id]', 'page.tsx'),
  'utf8',
);

describe('подсказка закрытого последнего этапа (Р-710)', () => {
  it('у последнего этапа — своя строка', () => {
    assert.match(
      page,
      /const DONE_LAST =\s*'Все этапы закрыты: проверьте оплату и завершите работу в «Управлении работой»\.';/u,
    );
  });

  it('строка выбирается по тому, есть ли следующий этап', () => {
    assert.match(page, /const hasNext = forStaff && state === 'DONE' \? await hasNextStage\(actor, stage\) : false;/u);
    assert.match(page, /state === 'DONE' && !hasNext\s*\?\s*DONE_LAST/u);
  });
});

describe('есть ли у работы этап после этого (Р-710)', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const { hasNextStage } = await import('../src/lib/cabinet/queries.ts');

  const ids: Record<string, string> = {};
  const who = (id: string, role: Actor['role'], extra: Partial<Actor> = {}): Actor => ({
    id,
    role,
    status: 'ACTIVE',
    clientProfileId: null,
    expertNdaSignedAt: null,
    ...extra,
  });

  before(async () => {
    const make = (suffix: string, role: Actor['role'], fullName: string) =>
      prisma.user.create({ data: { email: `nx-${suffix}-${stamp}@example.org`, fullName, role } });
    const [headUser, otherUser] = await Promise.all([
      make('head', 'HEAD', 'Руководитель Этапов'),
      make('cl', 'CLIENT', 'Чужой Клиент'),
    ]);
    const [profile, otherProfile] = await Promise.all([
      prisma.clientProfile.create({ data: { fullName: 'Клиент Этапов', normalizedName: `nx клиент ${stamp}` } }),
      prisma.clientProfile.create({
        data: { userId: otherUser.id, fullName: 'Чужой Клиент', normalizedName: `nx чужой ${stamp}` },
      }),
    ]);
    const type = await prisma.serviceType.create({ data: { code: `nx-${stamp}`, name: 'Проверка этапов' } });
    const project = await prisma.project.create({
      data: {
        code: `PD-NX-${String(stamp).slice(-6)}`,
        clientId: profile.id,
        serviceTypeId: type.id,
        title: 'Работа из трёх этапов',
        managerId: headUser.id,
      },
    });
    const stages = await Promise.all(
      [1, 2, 3].map((position) =>
        prisma.stage.create({ data: { projectId: project.id, position, title: `Этап ${position}`, state: 'DONE' } }),
      ),
    );
    Object.assign(ids, {
      head: headUser.id,
      other: otherUser.id,
      client: profile.id,
      otherClient: otherProfile.id,
      type: type.id,
      project: project.id,
      first: stages[0]!.id,
      last: stages[2]!.id,
    });
  });

  after(async () => {
    await prisma.stage.deleteMany({ where: { projectId: ids.project } });
    await prisma.project.deleteMany({ where: { id: ids.project } });
    await prisma.serviceType.deleteMany({ where: { id: ids.type } });
    await prisma.clientProfile.deleteMany({ where: { id: { in: [ids.client!, ids.otherClient!] } } });
    await prisma.user.deleteMany({ where: { id: { in: [ids.head!, ids.other!] } } });
    await prisma.$disconnect();
  });

  it('за первым закрытым этапом есть следующий, за последним — нет', async () => {
    const head = who(ids.head!, 'HEAD');
    const stage = (id: string) => prisma.stage.findUniqueOrThrow({ where: { id }, select: { projectId: true, position: true } });
    assert.equal(await hasNextStage(head, await stage(ids.first!)), true);
    assert.equal(await hasNextStage(head, await stage(ids.last!)), false);
  });

  it('чужой работы выборка не видит', async () => {
    const stranger = who(ids.other!, 'CLIENT', { clientProfileId: ids.otherClient! });
    const first = await prisma.stage.findUniqueOrThrow({ where: { id: ids.first }, select: { projectId: true, position: true } });
    assert.equal(await hasNextStage(stranger, first), false);
  });
});
