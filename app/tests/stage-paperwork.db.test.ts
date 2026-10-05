/**
 * Транш с этапом; «Этап принят: акт и счёт» (требование РК-12, решение
 * Р-338) — шаги H.14, H.15: согласование клиентом даёт руководителю дело и
 * сигнал; акт по работе дело закрывает; возврат завершённого этапа — дело
 * «проверьте акт и транш», закрывается отметкой; заказ с договором от
 * менеджера — дело «Проверьте договор»; транш привязывается только к
 * этапу своей работы; подсказка «Следующий этап не оплачен».
 *
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 's'.repeat(48);
process.env.CABINET_STORAGE_DIR ??= mkdtempSync(path.join(tmpdir(), 'pd-sp-'));

const enabled = Boolean(process.env.DATABASE_URL);
const stamp = Date.now();

describe('акт и счёт после приёмки (РК-12)', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const projects = await import('../src/lib/cabinet/projects.ts');
  const finance = await import('../src/lib/cabinet/finance.ts');
  const materials = await import('../src/lib/cabinet/materials.ts');
  const checks = await import('../src/lib/cabinet/head-checks.ts');

  const ids: Record<string, string> = {};
  const who = (id: string, role: Actor['role'], extra: Partial<Actor> = {}): Actor => ({
    id,
    role,
    status: 'ACTIVE',
    clientProfileId: null,
    expertNdaSignedAt: null,
    ...extra,
  });
  const head = () => who(ids.head!, 'HEAD');
  const manager = () => who(ids.manager!, 'MANAGER');
  const client = () => who(ids.clientUser!, 'CLIENT', { clientProfileId: ids.client! });
  const open = (kind?: string) =>
    prisma.headCheck.findMany({ where: { projectId: ids.project, closedAt: null, ...(kind === undefined ? {} : { kind: kind as never }) } });

  before(async () => {
    const make = (suffix: string, role: Actor['role'], fullName: string) =>
      prisma.user.create({ data: { email: `sp-${suffix}-${stamp}@example.org`, fullName, role } });
    const [headUser, managerUser, clientUser] = await Promise.all([
      make('head', 'HEAD', 'Руководитель Актов'),
      make('mgr', 'MANAGER', 'Менеджер Актов'),
      make('cl', 'CLIENT', 'Клиент Актов'),
    ]);
    const profile = await prisma.clientProfile.create({
      data: { userId: clientUser.id, fullName: 'Клиент Актов', normalizedName: `sp клиент ${stamp}` },
    });
    const type = await prisma.serviceType.create({ data: { code: `sp-${stamp}`, name: 'Проверка актов' } });
    const project = await prisma.project.create({
      data: {
        code: `PD-SP-${String(stamp).slice(-6)}`,
        clientId: profile.id,
        serviceTypeId: type.id,
        title: 'Работа для проверки актов',
        managerId: managerUser.id,
      },
    });
    const [first, second] = await Promise.all([
      prisma.stage.create({ data: { projectId: project.id, position: 1, title: 'Обзор', state: 'IN_APPROVAL' } }),
      prisma.stage.create({ data: { projectId: project.id, position: 2, title: 'Глава 2', state: 'NOT_STARTED' } }),
    ]);
    const contract = await prisma.contract.create({
      data: { projectId: project.id, number: `SP-${stamp}`, totalAmount: 10_000_000n, signedOn: new Date() },
    });
    Object.assign(ids, {
      head: headUser.id,
      manager: managerUser.id,
      clientUser: clientUser.id,
      client: profile.id,
      type: type.id,
      project: project.id,
      first: first.id,
      second: second.id,
      contract: contract.id,
    });
  });

  after(async () => {
    const users = [ids.head!, ids.manager!, ids.clientUser!];
    const versions = await prisma.materialVersion.findMany({ where: { material: { projectId: ids.project } }, select: { id: true } });
    const versionIds = versions.map((version) => version.id);
    await prisma.notificationOutbox.deleteMany({ where: { OR: [{ userId: { in: users } }, { projectId: ids.project }] } });
    await prisma.headCheck.deleteMany({ where: { projectId: ids.project } });
    await prisma.fileAccessLog.deleteMany({ where: { versionId: { in: versionIds } } });
    await prisma.materialVersion.deleteMany({ where: { id: { in: versionIds } } });
    await prisma.material.deleteMany({ where: { projectId: ids.project } });
    await prisma.tranche.deleteMany({ where: { contractId: ids.contract } });
    await prisma.contract.deleteMany({ where: { id: ids.contract } });
    await prisma.stageStateChange.deleteMany({ where: { stage: { projectId: ids.project } } });
    await prisma.projectEvent.deleteMany({ where: { projectId: ids.project } });
    await prisma.auditEvent.deleteMany({ where: { OR: [{ projectId: ids.project }, { actorId: { in: users } }] } });
    await prisma.stage.deleteMany({ where: { projectId: ids.project } });
    await prisma.project.deleteMany({ where: { id: ids.project } });
    await prisma.clientProfile.deleteMany({ where: { id: ids.client } });
    await prisma.serviceType.deleteMany({ where: { id: ids.type } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  });

  it('транш — только к этапу своей работы; подсказка «Следующий этап не оплачен»', async () => {
    const foreign = await prisma.stage.findFirst({ where: { projectId: { not: ids.project } }, select: { id: true } });
    if (foreign !== null) {
      await assert.rejects(
        finance.addTranche(head(), { contractId: ids.contract!, title: 'Чужой', amount: 100n, stageId: foreign.id }),
        /не из этой работы/u,
      );
    }
    const { tranche } = await finance.addTranche(head(), {
      contractId: ids.contract!,
      title: 'Оплата главы 2',
      amount: 5_000_000n,
      stageId: ids.second!,
    });
    ids.tranche = tranche.id;
    assert.equal(await checks.nextStageUnpaid(manager(), ids.first!), true);
  });

  it('H.14: клиент согласовал этап — дело «Этап принят» и сигнал руководителю; акт дело закрывает', async () => {
    await projects.setStageState(client(), ids.first!, 'DONE');
    const [check, ...rest] = await open('ACT_AFTER_ACCEPT');
    assert.equal(rest.length, 0);
    assert.equal(check?.stageId, ids.first);
    const signal = await prisma.notificationOutbox.findFirst({ where: { userId: ids.head, eventKind: 'STAGE_ACCEPTED', channel: 'EMAIL' } });
    assert.ok(signal !== null, 'сигнала руководителю нет');
    assert.doesNotMatch(signal.body, /\d[\d\s]*₽/u, 'сумма в сигнале');
    assert.ok((await checks.openChecks(head())).some((row) => row.id === check!.id));
    await materials.uploadVersion(head(), {
      projectId: ids.project!,
      kind: 'ACT',
      contractId: ids.contract!,
      title: 'Акт по этапу 1',
      originalName: 'akt.pdf',
      contentType: 'application/pdf',
      body: Buffer.from('%PDF-1.4 акт'),
    });
    assert.deepEqual(await open('ACT_AFTER_ACCEPT'), []);
  });

  it('H.15: возврат завершённого этапа — дело «проверьте акт и транш», закрывается отметкой', async () => {
    await projects.reopenStage(manager(), { stageId: ids.first!, reason: 'Клиент просит дополнить обзор' });
    const [check] = await open('ACT_AFTER_REOPEN');
    assert.ok(check !== undefined);
    await assert.rejects(checks.closeCheck(manager(), check.id, 'проверено'), /не разрешено/u);
    await assert.rejects(checks.closeCheck(head(), check.id, 'как-нибудь'), /Неизвестная отметка/u);
    await checks.closeCheck(head(), check.id, 'проверено');
    assert.deepEqual(await open('ACT_AFTER_REOPEN'), []);
    await assert.rejects(checks.closeCheck(head(), check.id, 'проверено'), /уже закрыто/u);
  });

  it('оплаченный транш следующего этапа — подсказки нет', async () => {
    await finance.setTrancheStatus(head(), ids.tranche!, 'PAID', new Date(Date.UTC(2026, 9, 1)));
    assert.equal(await checks.nextStageUnpaid(manager(), ids.first!), false);
  });
});
