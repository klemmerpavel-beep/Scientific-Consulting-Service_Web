/**
 * Заявки в аналитике (требование РК-18, решение Р-351): заявки по месяцам
 * и страницам сайта, конверсия «заявка → заказ»; спам и отзывы не входят;
 * вид заявки — по направлению формы; заявки без направления считаются
 * отдельно; менеджеру выборка закрыта.
 *
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 'a'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);
const stamp = Date.now();

describe('заявки в аналитике (РК-18)', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const leads = await import('../src/lib/cabinet/analytics/leads.ts');
  const { AccessDenied } = await import('../src/lib/cabinet/access.ts');

  const ids: Record<string, string> = {};
  const created: string[] = [];
  const who = (id: string, role: Actor['role']): Actor => ({
    id,
    role,
    status: 'ACTIVE',
    clientProfileId: null,
    expertNdaSignedAt: null,
  });
  const head = () => who(ids.head!, 'HEAD');
  const SOURCE = `test-${stamp}`;
  const AT = new Date('2026-10-15T09:00:00Z');

  before(async () => {
    const [headUser, managerUser] = await Promise.all([
      prisma.user.create({ data: { email: `la-head-${stamp}@example.org`, fullName: 'Руководитель Заявок', role: 'HEAD' } }),
      prisma.user.create({ data: { email: `la-mgr-${stamp}@example.org`, fullName: 'Менеджер Заявок', role: 'MANAGER' } }),
    ]);
    const profile = await prisma.clientProfile.create({ data: { fullName: 'Клиент Заявок', normalizedName: `la клиент ${stamp}` } });
    const type = await prisma.serviceType.create({ data: { code: `la-${stamp}`, name: 'Проверка заявок' } });
    const project = await prisma.project.create({
      data: { code: `PD-LA-${String(stamp).slice(-6)}`, clientId: profile.id, serviceTypeId: type.id, title: 'Из заявки', managerId: managerUser.id },
    });
    const lead = (suffix: string, extra: Record<string, unknown>) =>
      prisma.lead.create({
        data: {
          source: SOURCE,
          name: `Заявитель ${suffix} ${stamp}`,
          contactKind: 'email',
          contact: `la-${suffix}-${stamp}@example.org`,
          form: 'request',
          consentGiven: true,
          consentVersion: '2026-08-21',
          createdAt: new Date('2026-09-10T09:00:00Z'),
          ...extra,
        },
      });
    const rows = await Promise.all([
      lead('a', { direction: 'Научная степень', projectId: project.id }),
      lead('b', { direction: 'Научная степень' }),
      lead('c', { direction: null, createdAt: new Date('2026-10-02T09:00:00Z') }),
      lead('spam', { direction: 'Научная степень', status: 'SPAM' }),
      lead('review', { form: 'review' }),
    ]);
    created.push(...rows.map((row) => row.id));
    Object.assign(ids, { head: headUser.id, manager: managerUser.id, client: profile.id, type: type.id, project: project.id });
  });

  after(async () => {
    await prisma.lead.updateMany({ where: { id: { in: created } }, data: { projectId: null } });
    await prisma.lead.deleteMany({ where: { id: { in: created } } });
    await prisma.project.deleteMany({ where: { id: ids.project } });
    await prisma.clientProfile.deleteMany({ where: { id: ids.client } });
    await prisma.serviceType.deleteMany({ where: { id: ids.type } });
    await prisma.user.deleteMany({ where: { id: { in: [ids.head!, ids.manager!] } } });
  });

  it('по странице сайта: спам и отзывы не входят; конверсия — заявки, ставшие работой', async () => {
    const rows = (await leads.leadRows(head())).filter((row) => row.source === SOURCE);
    assert.equal(rows.length, 3, 'спам или отзыв в выборке');
    const [source] = leads.leadsBySource(rows);
    assert.deepEqual({ leads: source!.leads, converted: source!.converted }, { leads: 3, converted: 1 });
    assert.equal(Math.round(source!.conversion! * 100), 33);
  });

  it('по месяцам — двенадцать месяцев по текущий; сентябрь и октябрь', async () => {
    const rows = (await leads.leadRows(head())).filter((row) => row.source === SOURCE);
    const months = leads.leadsByMonth(rows, AT);
    assert.equal(months.length, 12);
    assert.equal(months[11]!.key, '2026-10');
    assert.deepEqual(
      months.slice(-2).map((month) => [month.key, month.leads, month.converted]),
      [
        ['2026-09', 2, 1],
        ['2026-10', 1, 0],
      ],
    );
  });

  it('вид заявки — по направлению формы; без направления — отдельно', async () => {
    const rows = (await leads.leadRows(head())).filter((row) => row.source === SOURCE);
    const byType = leads.leadsForType(rows, 'dissertation');
    assert.equal(byType.direction, 'Научная степень');
    assert.equal(byType.byMonth[8], 2);
    assert.equal(byType.undirected, 1);
    assert.equal(leads.leadsForType(rows, 'unknown').direction, null);
  });

  it('менеджеру выборка закрыта', async () => {
    await assert.rejects(leads.leadRows(who(ids.manager!, 'MANAGER')), AccessDenied);
  });
});
