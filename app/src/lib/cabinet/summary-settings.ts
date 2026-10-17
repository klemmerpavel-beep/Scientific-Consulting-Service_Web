/**
 * Хранение раскладки «Сводки» (план по образцу, К-5, решение Р-595).
 *
 * Раскладка лежит у самого человека (`User.summaryLayout`) и идёт за ним на
 * любое устройство: адрес её не запоминает, а cookie держит только на
 * одном браузере и задела бы правовые тексты о cookie. Раскладка по
 * умолчанию не хранится — в базе остаётся пусто, и новые плашки встают у
 * такого руководителя сами.
 *
 * Настройка — у того, кто видит аналитику (`ANALYTICS_VIEW`), то есть у
 * руководителя: у менеджера своя «Работа на сегодня», и её состав задан
 * пределом в пять блоков (Р-183).
 */

import { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../db.ts';
import { ensure, type Actor } from './access.ts';
import { record } from './audit.ts';
import { isDefaultLayout, parseLayout, type SummaryLayout } from './summary-layout.ts';

/** Раскладка руководителя; не настроена — по умолчанию. */
export async function summaryLayoutOf(actor: Actor): Promise<SummaryLayout> {
  ensure(actor, 'ANALYTICS_VIEW');
  const user = await prisma.user.findUnique({ where: { id: actor.id }, select: { summaryLayout: true } });
  return parseLayout(user?.summaryLayout ?? null);
}

/**
 * Сохранить раскладку; `null` — вернуть как было. Запись и строка журнала
 * — одна транзакция (как у расходов, Р-463).
 */
export async function saveSummaryLayout(actor: Actor, layout: SummaryLayout | null): Promise<void> {
  ensure(actor, 'ANALYTICS_VIEW');
  const value = layout === null || isDefaultLayout(layout) ? null : { order: [...layout.order], hidden: [...layout.hidden] };
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: actor.id }, data: { summaryLayout: value ?? Prisma.DbNull } });
    await record(
      actor,
      {
        action: 'SUMMARY_LAYOUT_SAVED',
        objectType: 'User',
        objectId: actor.id,
        payload: value === null ? { reset: true } : value,
      },
      tx,
    );
  });
}
