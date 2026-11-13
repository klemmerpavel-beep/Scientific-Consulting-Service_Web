/**
 * «Редактировать заказ» на настоящей базе (решение Р-872): кто правит,
 * закрытые и перенесённые из книги работы, срок с причиной и письмом только
 * у действующей работы из кабинета, сумма договора в той же транзакции,
 * сверка прочитанной карточки и письма о смене состояния по работам из книги.
 *
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 'o'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);

describe('правка заказа', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const { AccessDenied } = await import('../src/lib/cabinet/access.ts');
  const { editOrder } = await import('../src/lib/cabinet/orders.ts');
  const projects = await import('../src/lib/cabinet/projects.ts');
  const finance = await import('../src/lib/cabinet/finance.ts');

  const stamp = Date.now();
  const tail = String(stamp).slice(-6);
  const ids: Record<string, string> = {};
  const works: string[] = [];
  const users: string[] = [];

  const who = (id: string, role: Actor['role'], extra: Partial<Actor> = {}): Actor => ({
    id,
    role,
    status: 'ACTIVE',
    clientProfileId: null,
    expertNdaSignedAt: role === 'EXPERT' ? new Date('2026-01-01T00:00:00Z') : null,
    ...extra,
  });
  const head = () => who(ids.head!, 'HEAD');
  const manager = () => who(ids.manager!, 'MANAGER');
  const stranger = () => who(ids.stranger!, 'MANAGER');
  const curator = () => who(ids.expert!, 'EXPERT');
  const client = () => who(ids.clientUser!, 'CLIENT', { clientProfileId: ids.client! });
  const at = (iso: string) => new Date(`${iso}T00:00:00Z`);

  const newWork = async (suffix: string, extra: Record<string, unknown> = {}) => {
    const project = await prisma.project.create({
      data: {
        code: `PD-OE-${tail}-${suffix}`,
        clientId: ids.client!,
        serviceTypeId: ids.type!,
        title: `Заказ ${suffix}`,
        managerId: ids.manager!,
        expertId: ids.expert!,
        ...extra,
      },
    });
    works.push(project.id);
    return project;
  };
  const base = async (projectId: string) => {
    const row = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    return {
      projectId,
      updatedAt: row.updatedAt.toISOString(),
      title: row.title,
      topic: row.topic,
      summary: row.summary,
      serviceTypeId: row.serviceTypeId,
      dueOn: row.dueOn,
    };
  };
  const clientLetters = (projectId: string) =>
    prisma.notificationOutbox.count({ where: { projectId, userId: ids.clientUser } });
  const curatorLetters = (projectId: string) =>
    prisma.notificationOutbox.count({ where: { projectId, userId: ids.expert } });

  before(async () => {
    const make = async (suffix: string, role: Actor['role'], fullName: string) => {
      const user = await prisma.user.create({
        data: { email: `oe-${suffix}-${stamp}@example.org`, fullName, role, notifyEmail: true },
      });
      users.push(user.id);
      return user.id;
    };
    ids.head = await make('head', 'HEAD', 'Руководитель Заказов');
    ids.manager = await make('mgr', 'MANAGER', 'Менеджер Заказов');
    ids.stranger = await make('other', 'MANAGER', 'Чужой Менеджер Заказов');
    ids.expert = await make('exp', 'EXPERT', 'Куратор Заказов');
    await prisma.expertProfile.create({ data: { userId: ids.expert, ndaSignedAt: new Date('2026-01-01T00:00:00Z') } });
    ids.clientUser = await make('cli', 'CLIENT', 'Клиент Заказов');
    const profile = await prisma.clientProfile.create({
      data: { userId: ids.clientUser, fullName: 'Клиент Заказов', normalizedName: `oe клиент ${stamp}` },
    });
    ids.client = profile.id;
    const [type, other, retired] = await Promise.all([
      prisma.serviceType.create({ data: { code: `oe-${stamp}`, name: 'Диссертация (проверка)' } }),
      prisma.serviceType.create({ data: { code: `oe2-${stamp}`, name: 'ВКР (проверка)' } }),
      prisma.serviceType.create({ data: { code: `oe3-${stamp}`, name: 'Снятый вид', isActive: false } }),
    ]);
    Object.assign(ids, { type: type.id, otherType: other.id, retired: retired.id });
  });

  after(async () => {
    await prisma.notificationOutbox.deleteMany({ where: { OR: [{ projectId: { in: works } }, { userId: { in: users } }] } });
    await prisma.auditEvent.deleteMany({ where: { OR: [{ projectId: { in: works } }, { actorId: { in: users } }] } });
    await prisma.tranche.deleteMany({ where: { contract: { projectId: { in: works } } } });
    await prisma.contract.deleteMany({ where: { projectId: { in: works } } });
    await prisma.headCheck.deleteMany({ where: { projectId: { in: works } } });
    await prisma.projectEvent.deleteMany({ where: { projectId: { in: works } } });
    await prisma.project.deleteMany({ where: { id: { in: works } } });
    await prisma.clientProfile.deleteMany({ where: { id: ids.client } });
    await prisma.serviceType.deleteMany({ where: { id: { in: [ids.type!, ids.otherType!, ids.retired!] } } });
    await prisma.expertProfile.deleteMany({ where: { userId: ids.expert } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  });

  it('заказ правят руководитель и менеджер своей работы; клиент, куратор и чужой менеджер — нет', async () => {
    const work = await newWork('R');
    for (const actor of [client(), curator(), stranger()]) {
      await assert.rejects(editOrder(actor, { ...(await base(work.id)), title: 'Чужая правка' }), AccessDenied, actor.role);
    }
    await editOrder(manager(), { ...(await base(work.id)), title: 'Правка менеджера' });
    await editOrder(head(), { ...(await base(work.id)), title: 'Правка руководителя' });
    assert.equal((await prisma.project.findUniqueOrThrow({ where: { id: work.id } })).title, 'Правка руководителя');
  });

  it('закрытая работа: карточка, вид, срок и сумма правятся без писем; журнал и дело руководителю', async () => {
    const work = await newWork('C', { status: 'COMPLETED', closedOn: at('2026-10-01'), dueOn: at('2026-09-30') });
    const { changed } = await editOrder(manager(), {
      ...(await base(work.id)),
      title: 'ВКР бакалавра',
      topic: 'Учёт и анализ',
      summary: 'Короткое описание',
      serviceTypeId: ids.otherType!,
      dueOn: at('2026-10-15'),
      contractTotal: 12_000_000n,
    });
    assert.deepEqual(changed.sort(), ['contract', 'dueOn', 'serviceType', 'summary', 'title', 'topic']);
    const row = await prisma.project.findUniqueOrThrow({ where: { id: work.id }, include: { contract: true } });
    assert.equal(row.serviceTypeId, ids.otherType);
    assert.equal(row.contract?.totalAmount, 12_000_000n);
    assert.equal(row.contract?.number, work.code, 'номер нового договора — не код работы');
    assert.equal(await clientLetters(work.id), 0, 'клиенту ушло письмо о правке карточки');
    assert.equal(await curatorLetters(work.id), 0, 'куратору ушло письмо о правке карточки');
    const edited = await prisma.auditEvent.findFirstOrThrow({ where: { projectId: work.id, action: 'PROJECT_EDITED' } });
    const payload = edited.payload as Record<string, unknown>;
    assert.equal(payload.serviceTypeTo, 'ВКР (проверка)');
    assert.equal(payload.dueFrom, '2026-09-30');
    assert.ok(await prisma.auditEvent.findFirst({ where: { projectId: work.id, action: 'CONTRACT_SAVED' } }));
    // Менеджер завёл и поднял сумму — одно дело «Проверьте договор».
    await editOrder(manager(), { ...(await base(work.id)), contractTotal: 13_000_000n });
    assert.equal(await prisma.headCheck.count({ where: { projectId: work.id, kind: 'CONTRACT_BY_MANAGER', closedAt: null } }), 1);
  });

  it('работа из книги: срок меняется без причины и без письма', async () => {
    const work = await newWork('B', { source: 'IMPORT', dueOn: at('2026-12-01') });
    await editOrder(manager(), { ...(await base(work.id)), dueOn: at('2027-01-20') });
    assert.equal(await clientLetters(work.id), 0);
    assert.equal(await prisma.projectEvent.count({ where: { projectId: work.id, kind: 'PROJECT_DUE_CHANGED' } }), 0);
  });

  it('действующая работа из кабинета: перенос срока — с причиной и письмом клиенту (Р-391)', async () => {
    const work = await newWork('W', { dueOn: at('2026-12-01') });
    await assert.rejects(editOrder(manager(), { ...(await base(work.id)), dueOn: at('2026-12-20') }), /с причиной/u);
    await editOrder(manager(), { ...(await base(work.id)), dueOn: at('2026-12-20'), dueReason: 'Клиент попросил' });
    assert.ok((await clientLetters(work.id)) > 0, 'клиенту не ушло письмо о переносе');
    // Без переноса срока писем нет.
    const before = await clientLetters(work.id);
    await editOrder(manager(), { ...(await base(work.id)), title: 'Новое название', serviceTypeId: ids.otherType! });
    assert.equal(await clientLetters(work.id), before, 'письмо о правке названия');
  });

  it('сумма ниже поступившего — отказ, и карточка не сохранена наполовину', async () => {
    const work = await newWork('M');
    await editOrder(head(), { ...(await base(work.id)), contractTotal: 5_000_000n });
    await finance.recordReceipt(head(), { projectId: work.id, amount: 3_000_000n, paidOn: at('2026-10-01') });
    await assert.rejects(
      editOrder(manager(), { ...(await base(work.id)), title: 'Не должно сохраниться', contractTotal: 2_000_000n }),
      /меньше уже полученного/u,
    );
    const row = await prisma.project.findUniqueOrThrow({ where: { id: work.id }, include: { contract: true } });
    assert.equal(row.title, 'Заказ M');
    assert.equal(row.contract?.totalAmount, 5_000_000n);
  });

  it('устаревшая форма и снятый вид работы — отказ', async () => {
    const work = await newWork('S');
    const stale = await base(work.id);
    await editOrder(manager(), { ...(await base(work.id)), title: 'Первая вкладка' });
    await assert.rejects(editOrder(manager(), { ...stale, title: 'Вторая вкладка' }), /уже изменили/u);
    await assert.rejects(
      editOrder(manager(), { ...(await base(work.id)), serviceTypeId: ids.retired! }),
      /из справочника/u,
    );
  });

  it('смена состояния работы из книги — без писем клиенту и куратору; из кабинета — с письмом', async () => {
    const book = await newWork('SB', { source: 'IMPORT' });
    await projects.setProjectStatus(manager(), book.id, 'COMPLETED');
    await projects.setProjectStatus(manager(), book.id, 'ACTIVE');
    assert.equal(await clientLetters(book.id), 0, 'клиенту работы из книги ушло письмо о состоянии');
    assert.equal(await curatorLetters(book.id), 0, 'куратору работы из книги ушло письмо о состоянии');
    assert.equal(await prisma.projectEvent.count({ where: { projectId: book.id, kind: 'PROJECT_STATUS_CHANGED' } }), 2);
    const web = await newWork('SW');
    await projects.setProjectStatus(manager(), web.id, 'PAUSED', 'Ждём оплату');
    assert.ok((await clientLetters(web.id)) > 0, 'клиенту работы из кабинета не ушло письмо');
  });
});
