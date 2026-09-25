/**
 * Выборка для витрин аналитики.
 *
 * Единственное место контура аналитики, где есть база и права. Выборка
 * строится через `scopeProjects`, а не отдельным условием: перечень
 * «что видно этой роли» существует в одном экземпляре, и обойти его,
 * написав свой запрос, здесь нельзя.
 */

import { ensure, scopeProjects, type Actor } from '../access.ts';
import { prisma } from '../../db.ts';
import type { ProjectRow } from './metrics.ts';

/**
 * Прочитать строки витрины. Деньги сводятся здесь же: поступившим считается
 * сумма траншей со статусом «оплачен», а не поле проекта — отдельного поля
 * нет и быть не должно, иначе оно разошлось бы с траншами.
 */
export async function loadRows(actor: Actor): Promise<ProjectRow[]> {
  ensure(actor, 'ANALYTICS_VIEW');
  const scope = scopeProjects(actor);
  if (scope === null) return [];

  const projects = await prisma.project.findMany({
    where: scope,
    // Порядок задан явно: без него строки приходили в порядке, выбранном
    // базой, и таблица отчёта за период на двух прогонах съёмки подряд
    // стояла по-разному (решение Р-205).
    orderBy: { code: 'asc' },
    select: {
      id: true,
      code: true,
      title: true,
      status: true,
      startedOn: true,
      dueOn: true,
      closedOn: true,
      client: { select: { id: true, fullName: true } },
      serviceType: { select: { code: true, name: true } },
      contract: {
        select: {
          totalAmount: true,
          signedOn: true,
          tranches: { select: { amount: true, status: true, paidOn: true } },
        },
      },
    },
  });

  return projects.map((project) => ({
    id: project.id,
    code: project.code,
    title: project.title,
    clientId: project.client.id,
    clientName: project.client.fullName,
    typeCode: project.serviceType.code,
    typeName: project.serviceType.name,
    status: project.status,
    startedOn: project.startedOn,
    dueOn: project.dueOn,
    closedOn: project.closedOn,
    cost: project.contract?.totalAmount ?? 0n,
    paid: total(project.contract?.tranches, 'PAID'),
    writtenOff: total(project.contract?.tranches, 'WRITTEN_OFF'),
    payments: (project.contract?.tranches ?? [])
      .filter((tranche) => tranche.status === 'PAID')
      .map((tranche) => ({
        amount: tranche.amount,
        // Та же подстановка даты, что в итогах по годам (finance-years.ts).
        on: tranche.paidOn ?? project.contract?.signedOn ?? project.startedOn ?? null,
      })),
  }));
}

function total(
  tranches: readonly { amount: bigint; status: string }[] | undefined,
  status: 'PAID' | 'WRITTEN_OFF',
): bigint {
  return (tranches ?? [])
    .filter((tranche) => tranche.status === status)
    .reduce((acc, tranche) => acc + tranche.amount, 0n);
}
