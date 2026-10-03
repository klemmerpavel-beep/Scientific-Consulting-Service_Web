/**
 * «Открыть кабинет» и возврат после входа (требование Т-06, решение
 * Р-309): письмо «Этап готов к согласованию» ведёт на экран этапа; путь
 * возврата лежит в токене входа и после входа возвращается; чужой путь в
 * токене отбрасывается; в письме — кнопка, но не ссылка входа.
 *
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 'o'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);
const stamp = Date.now();

describe('открыть кабинет из письма', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const projects = await import('../src/lib/cabinet/projects.ts');
  const auth = await import('../src/lib/cabinet/auth.ts');
  const { renderLetter } = await import('../src/lib/cabinet/outbox.ts');
  const { createRawToken, digest } = await import('../src/lib/cabinet/token.ts');

  const ids: Record<string, string> = {};
  const curator = (): Actor => ({
    id: ids.manager!,
    role: 'MANAGER',
    status: 'ACTIVE',
    clientProfileId: null,
    expertNdaSignedAt: null,
  });

  before(async () => {
    const [manager, client] = await Promise.all([
      prisma.user.create({ data: { email: `oc-mgr-${stamp}@example.org`, fullName: 'Куратор открытия', role: 'MANAGER' } }),
      prisma.user.create({ data: { email: `oc-cl-${stamp}@example.org`, fullName: 'Клиент открытия', role: 'CLIENT' } }),
    ]);
    const profile = await prisma.clientProfile.create({
      data: { userId: client.id, fullName: 'Клиент открытия', normalizedName: `oc клиент ${stamp}` },
    });
    const type = await prisma.serviceType.create({ data: { code: `oc-${stamp}`, name: 'Проверка открытия' } });
    const project = await prisma.project.create({
      data: {
        code: `PD-OC-${String(stamp).slice(-6)}`,
        clientId: profile.id,
        serviceTypeId: type.id,
        title: 'Работа для открытия',
        managerId: manager.id,
      },
    });
    const stage = await prisma.stage.create({
      data: { projectId: project.id, position: 1, title: 'Обзор', state: 'IN_PROGRESS' },
    });
    // На согласование этап уходит с материалом, который видит клиент.
    await prisma.material.create({
      data: {
        projectId: project.id,
        stageId: stage.id,
        title: 'Обзор литературы',
        createdById: manager.id,
        versions: {
          create: {
            number: 1,
            storageKey: `open-cabinet/${stage.id}`,
            originalName: 'obzor.docx',
            sizeBytes: 10n,
            sha256: 'a'.repeat(64),
            contentType: 'application/octet-stream',
            uploadedById: manager.id,
          },
        },
      },
    });
    Object.assign(ids, {
      manager: manager.id,
      client: client.id,
      profile: profile.id,
      type: type.id,
      project: project.id,
      stage: stage.id,
    });
  });

  after(async () => {
    await prisma.notificationOutbox.deleteMany({ where: { projectId: ids.project } });
    await prisma.stageStateChange.deleteMany({ where: { stageId: ids.stage } });
    await prisma.materialVersion.deleteMany({ where: { material: { projectId: ids.project } } });
    await prisma.material.deleteMany({ where: { projectId: ids.project } });
    await prisma.projectEvent.deleteMany({ where: { projectId: ids.project } });
    await prisma.auditEvent.deleteMany({ where: { projectId: ids.project } });
    await prisma.stage.deleteMany({ where: { projectId: ids.project } });
    await prisma.project.deleteMany({ where: { id: ids.project } });
    await prisma.clientProfile.deleteMany({ where: { id: ids.profile } });
    await prisma.serviceType.deleteMany({ where: { id: ids.type } });
    await prisma.session.deleteMany({ where: { userId: ids.client } });
    await prisma.loginToken.deleteMany({ where: { userId: ids.client } });
    await prisma.auditEvent.deleteMany({ where: { actorId: { in: [ids.manager!, ids.client!] } } });
    await prisma.user.deleteMany({ where: { id: { in: [ids.manager!, ids.client!] } } });
  });

  it('письмо «Этап готов к согласованию» ведёт на экран этапа', async () => {
    await projects.setStageState(curator(), ids.stage!, 'IN_APPROVAL', 'Обзор литературы собран; дальше — методика');
    const rows = await prisma.notificationOutbox.findMany({
      where: { projectId: ids.project, userId: ids.client, eventKind: 'STAGE_IN_APPROVAL' },
    });
    assert.ok(rows.length > 0, 'письмо клиенту не поставлено');
    assert.ok(rows.every((row) => row.path === `/cabinet/stages/${ids.stage}`));
  });

  it('в письме — кнопка «Открыть кабинет», ссылки входа нет', () => {
    const open = `https://prodisser.ru/cabinet/open?to=${encodeURIComponent(`/cabinet/stages/${ids.stage}`)}&email=a%40b.ru`;
    const html = renderLetter('Этап готов к согласованию', 'Проект PD.\nОткрыть этап можно в кабинете.', 'Подвал', open);
    assert.match(html, />Открыть кабинет<\/a>/u);
    assert.ok(html.includes('href="https://prodisser.ru/cabinet/open?to='), html);
    assert.doesNotMatch(html, /\/cabinet\/enter\//u);
    assert.doesNotMatch(renderLetter('Тема', 'Текст', 'Подвал'), /Открыть кабинет/u, 'заявителю кнопка не нужна');
  });

  const issue = async (returnPath: string | null) => {
    const token = createRawToken();
    await prisma.loginToken.create({
      data: {
        selector: token.selector,
        verifierHash: digest(token.verifier),
        userId: ids.client!,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        requestIp: '127.0.0.1',
        returnPath,
      },
    });
    return token.value;
  };

  it('после входа — на экран, с которого человек пришёл', async () => {
    const entered = await auth.enterWithToken(await issue(`/cabinet/stages/${ids.stage}`), '127.0.0.1', 'node-test');
    assert.ok(entered !== null);
    assert.equal(entered.returnPath, `/cabinet/stages/${ids.stage}`);
  });

  it('чужой путь в токене отбрасывается; без пути — начальный экран', async () => {
    const forged = await auth.enterWithToken(await issue('//evil.com'), '127.0.0.1', null);
    assert.equal(forged?.returnPath, null);
    const plain = await auth.enterWithToken(await issue(null), '127.0.0.1', null);
    assert.equal(plain?.returnPath, null);
  });
});
