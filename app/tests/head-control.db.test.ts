/**
 * «Мои» и «Контроль» руководителя (требование РК-05, решение Р-337) —
 * шаги H.3, H.4: сообщение клиента в чужой работе, прочитанное менеджером
 * в срок, дела не даёт; непрочитанное дольше срока реакции — контрольное
 * дело с менеджером и днями ожидания; просроченная публикация закрывается
 * действием руководителя; сданный этап и заявка без ответа — тоже
 * контроль; свои дела руководителя — только по его работам; его счётчик
 * по чужой работе гаснет открытием.
 *
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 'r'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);
const stamp = Date.now();
const DAY = 86_400_000;

describe('«Мои» и «Контроль» (РК-05)', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const { controlItems } = await import('../src/lib/cabinet/control.ts');
  const messages = await import('../src/lib/cabinet/messages.ts');
  const materials = await import('../src/lib/cabinet/materials.ts');
  const settings = await import('../src/lib/cabinet/practice-settings.ts');

  const ids: Record<string, string> = {};
  const NDA = new Date(Date.UTC(2026, 0, 10));
  const who = (id: string, role: Actor['role'], extra: Partial<Actor> = {}): Actor => ({
    id,
    role,
    status: 'ACTIVE',
    clientProfileId: null,
    expertNdaSignedAt: role === 'EXPERT' ? NDA : null,
    ...extra,
  });
  const head = () => who(ids.head!, 'HEAD');
  const manager = () => who(ids.manager!, 'MANAGER');
  const longAgo = () => new Date(Date.now() - 10 * DAY);
  const mine = () => controlItems(head()).then((rows) => rows.filter((row) => row.title.includes(String(stamp))));

  before(async () => {
    const make = (suffix: string, role: Actor['role'], fullName: string) =>
      prisma.user.create({ data: { email: `hc-${suffix}-${stamp}@example.org`, fullName, role } });
    const [headUser, managerUser, curatorUser, clientUser] = await Promise.all([
      make('head', 'HEAD', 'Руководитель Контроля'),
      make('mgr', 'MANAGER', 'Нечаева Контроля'),
      make('cur', 'EXPERT', 'Куратор Контроля'),
      make('cl', 'CLIENT', 'Клиент Контроля'),
    ]);
    await prisma.expertProfile.create({ data: { userId: curatorUser.id, ndaSignedAt: NDA } });
    const profile = await prisma.clientProfile.create({
      data: { userId: clientUser.id, fullName: 'Клиент Контроля', normalizedName: `hc клиент ${stamp}` },
    });
    const type = await prisma.serviceType.create({ data: { code: `hc-${stamp}`, name: 'Проверка контроля' } });
    const project = await prisma.project.create({
      data: {
        code: `PD-HC-${String(stamp).slice(-6)}`,
        clientId: profile.id,
        serviceTypeId: type.id,
        title: `Чужая работа ${stamp}`,
        managerId: managerUser.id,
        expertId: curatorUser.id,
      },
    });
    const stage = await prisma.stage.create({
      data: { projectId: project.id, position: 1, title: `Глава ${stamp}`, state: 'IN_PROGRESS' },
    });
    Object.assign(ids, {
      head: headUser.id,
      manager: managerUser.id,
      curator: curatorUser.id,
      clientUser: clientUser.id,
      client: profile.id,
      type: type.id,
      project: project.id,
      stage: stage.id,
    });
  });

  after(async () => {
    const users = [ids.head!, ids.manager!, ids.curator!, ids.clientUser!];
    const versions = await prisma.materialVersion.findMany({ where: { material: { projectId: ids.project } }, select: { id: true } });
    const versionIds = versions.map((version) => version.id);
    await prisma.notificationOutbox.deleteMany({ where: { OR: [{ userId: { in: users } }, { projectId: ids.project }] } });
    await prisma.messageThreadRead.deleteMany({ where: { userId: { in: users } } });
    await prisma.message.deleteMany({ where: { projectId: ids.project } });
    await prisma.versionComment.deleteMany({ where: { versionId: { in: versionIds } } });
    await prisma.versionModeration.deleteMany({ where: { versionId: { in: versionIds } } });
    await prisma.materialVersion.deleteMany({ where: { id: { in: versionIds } } });
    await prisma.material.deleteMany({ where: { projectId: ids.project } });
    await prisma.projectEvent.deleteMany({ where: { projectId: ids.project } });
    await prisma.lead.deleteMany({ where: { name: `Заявитель ${stamp}` } });
    await prisma.practiceSetting.deleteMany({ where: { key: 'reactionDays' } });
    await prisma.auditEvent.deleteMany({ where: { OR: [{ projectId: ids.project }, { actorId: { in: users } }] } });
    await prisma.stage.deleteMany({ where: { projectId: ids.project } });
    await prisma.project.deleteMany({ where: { id: ids.project } });
    await prisma.clientProfile.deleteMany({ where: { id: ids.client } });
    await prisma.serviceType.deleteMany({ where: { id: ids.type } });
    await prisma.expertProfile.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  });

  it('H.3: прочитанное менеджером в срок — дела нет; непрочитанное дольше срока — контроль', async () => {
    const fresh = await prisma.message.create({
      data: { projectId: ids.project!, authorId: ids.clientUser!, body: 'Свежий вопрос' },
    });
    assert.deepEqual(await mine(), [], 'свежее сообщение — уже контроль');
    await prisma.message.update({ where: { id: fresh.id }, data: { createdAt: longAgo(), readAt: new Date() } });
    assert.deepEqual(await mine(), [], 'прочитанное менеджером — контроль');
    await prisma.message.create({
      data: { projectId: ids.project!, authorId: ids.clientUser!, body: 'Ответьте, пожалуйста', createdAt: longAgo() },
    });
    const [row, ...rest] = await mine();
    assert.equal(rest.length, 0);
    assert.equal(row?.kind, 'client');
    assert.equal(row?.manager, 'Нечаева Контроля');
    assert.ok(row!.waitDays >= 9);
    assert.match(row!.href, /\/messages$/u);
  });

  it('счётчик руководителя по чужой работе гаснет открытием; отметку менеджера он не ставит', async () => {
    assert.equal(await messages.unreadCount(head(), ids.project!), 1);
    await messages.markRead(head(), ids.project!);
    assert.equal(await messages.unreadCount(head(), ids.project!), 0);
    assert.equal(await messages.unreadCount(manager(), ids.project!), 1, 'руководитель снял отметку менеджера');
    // Контроль остаётся: сообщение не прочитано менеджером.
    assert.equal((await mine()).filter((row) => row.kind === 'client').length, 1);
    await messages.markRead(manager(), ids.project!);
    assert.equal((await mine()).filter((row) => row.kind === 'client').length, 0);
  });

  it('H.4: версия куратора ждёт публикации дольше срока — контроль; руководитель публикует сам', async () => {
    const material = await prisma.material.create({
      data: {
        projectId: ids.project!,
        stageId: ids.stage!,
        title: 'Глава куратора',
        createdById: ids.curator!,
        versions: {
          create: {
            number: 1,
            storageKey: `hc/${stamp}/v1`,
            originalName: 'glava.docx',
            sizeBytes: 10n,
            sha256: 'd'.repeat(64),
            contentType: 'application/octet-stream',
            uploadedById: ids.curator!,
          },
        },
      },
      include: { versions: true },
    });
    const versionId = material.versions[0]!.id;
    await prisma.versionModeration.create({ data: { versionId, createdAt: longAgo() } });
    const row = (await mine()).find((item) => item.kind === 'moderation');
    assert.equal(row?.href, `/cabinet/stages/${ids.stage}`);
    await materials.moderateVersion(head(), versionId, 'PUBLISHED');
    assert.ok(!(await mine()).some((item) => item.kind === 'moderation'));
  });

  it('сданный этап без решения и заявка без ответа — контроль', async () => {
    await prisma.stage.update({ where: { id: ids.stage }, data: { handedOverAt: longAgo(), handoverNote: 'Готово' } });
    await prisma.lead.create({
      data: {
        source: 'landing',
        name: `Заявитель ${stamp}`,
        contactKind: 'email',
        contact: `lead-${stamp}@example.org`,
        form: 'request',
        consentGiven: true,
        consentVersion: '2026-08-21',
        status: 'NEW',
        statusChangedAt: longAgo(),
      },
    });
    const rows = await controlItems(head());
    assert.ok(rows.some((row) => row.kind === 'handover' && row.title.includes(String(stamp))));
    assert.ok(rows.some((row) => row.kind === 'lead' && row.title.includes(`Заявитель ${stamp}`)));
  });

  it('срок реакции — настройка руководителя: длинный срок убирает контроль', async () => {
    await assert.rejects(settings.saveReactionDays(manager(), '3'), /не разрешено/u);
    await assert.rejects(settings.saveReactionDays(head(), '0'), /от 1 до 10/u);
    await settings.saveReactionDays(head(), '10');
    assert.equal(await settings.reactionDays(), 10);
    assert.ok(!(await controlItems(head())).some((row) => row.title.includes(String(stamp))));
    await settings.saveReactionDays(head(), '1');
  });

  it('контроль — только руководителю; своё дело менеджера в контроль не попадает', async () => {
    assert.deepEqual(await controlItems(manager()), []);
    await prisma.project.update({ where: { id: ids.project }, data: { managerId: ids.head } });
    // Заявка — не дело работы, она остаётся; дела по своей работе уходят.
    assert.ok(!(await controlItems(head())).some((row) => row.kind !== 'lead' && row.title.includes(String(stamp))));
    await prisma.project.update({ where: { id: ids.project }, data: { managerId: ids.manager } });
  });
});
