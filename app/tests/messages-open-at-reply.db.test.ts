/**
 * Письмо о новом сообщении ведёт к полю ответа (решение Р-740): путь
 * кнопки — `/cabinet/projects/{код}/messages#body`, и клиенту, и практике;
 * тема письма прежняя (Р-643).
 *
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 'z'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);
const stamp = Date.now();

describe('письмо о новом сообщении открывает поле ответа (Р-740)', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const messages = await import('../src/lib/cabinet/messages.ts');

  const ids: Record<string, string> = {};
  const code = `PD-OR-${String(stamp).slice(-6)}`;
  const actorOf = (id: string, role: Actor['role'], extra: Partial<Actor> = {}): Actor => ({
    id,
    role,
    status: 'ACTIVE',
    clientProfileId: null,
    expertNdaSignedAt: null,
    ...extra,
  });
  const letter = (userId: string) =>
    prisma.notificationOutbox.findFirst({
      where: { userId, projectId: ids.project, eventKind: 'MESSAGE_RECEIVED' },
      select: { subject: true, path: true },
    });

  before(async () => {
    // Менеджер — с закрытым доступом руководителей не задеваем: сообщение
    // клиента получает сторона практики работы.
    const [manager, client] = await Promise.all([
      prisma.user.create({ data: { email: `or-mgr-${stamp}@example.org`, fullName: 'Менеджер Ответа', role: 'MANAGER' } }),
      prisma.user.create({ data: { email: `or-cli-${stamp}@example.org`, fullName: 'Клиент Ответа', role: 'CLIENT' } }),
    ]);
    const type = await prisma.serviceType.create({ data: { code: `or-${stamp}`, name: 'Проверка ответа' } });
    const profile = await prisma.clientProfile.create({
      data: { fullName: 'Клиент Ответа', normalizedName: `or клиент ${stamp}`, userId: client.id },
    });
    const project = await prisma.project.create({
      data: { code, clientId: profile.id, serviceTypeId: type.id, title: 'Работа с ответом', managerId: manager.id },
    });
    Object.assign(ids, { manager: manager.id, client: client.id, profile: profile.id, type: type.id, project: project.id });
  });

  after(async () => {
    await prisma.notificationOutbox.deleteMany({ where: { projectId: ids.project } });
    await prisma.message.deleteMany({ where: { projectId: ids.project } });
    await prisma.auditEvent.deleteMany({ where: { OR: [{ projectId: ids.project }, { actorId: { in: [ids.manager!, ids.client!] } }] } });
    await prisma.project.deleteMany({ where: { id: ids.project } });
    await prisma.clientProfile.deleteMany({ where: { id: ids.profile } });
    await prisma.serviceType.deleteMany({ where: { id: ids.type } });
    await prisma.user.deleteMany({ where: { id: { in: [ids.manager!, ids.client!] } } });
  });

  it('клиенту — к полю ответа; тема прежняя', async () => {
    await messages.sendMessage(actorOf(ids.manager!, 'MANAGER'), ids.project!, 'Глава 2 принята, ждём замечания.');
    const row = await letter(ids.client!);
    assert.ok(row !== null, 'письма клиенту нет');
    assert.equal(row.path, `/cabinet/projects/${code}/messages#body`);
    assert.equal(row.subject, 'Новое сообщение по работе «Работа с ответом»');
  });

  it('менеджеру — тоже к полю ответа; тема прежняя', async () => {
    await messages.sendMessage(actorOf(ids.client!, 'CLIENT', { clientProfileId: ids.profile! }), ids.project!, 'Спасибо, посмотрю.');
    const row = await letter(ids.manager!);
    assert.ok(row !== null, 'письма менеджеру нет');
    assert.equal(row.path, `/cabinet/projects/${code}/messages#body`);
    assert.equal(row.subject, `Новое сообщение по работе ${code}`);
  });
});
