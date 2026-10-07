import type { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../db.ts';
import type { Actor } from './access.ts';

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * Журнал действий. Запись выполняется явным вызовом из сервисного слоя,
 * а не событиями ORM: неявная запись даёт шум из служебных обновлений и
 * теряет бизнес-смысл действия — «менеджер одобрил заявку» превращается
 * в «изменена строка таблицы Lead».
 *
 * Персональные данные сверх необходимого в журнал не пишутся: действующее
 * лицо хранится идентификатором, содержимое — только изменившимися полями.
 */

export interface AuditInput {
  readonly action: string;
  readonly objectType: string;
  readonly objectId?: string | null;
  readonly projectId?: string | null;
  readonly payload?: Record<string, unknown> | null;
  readonly ip?: string | null;
}

/**
 * Запись журнала. `db` — транзакция вызывающего, когда запись должна
 * откатиться вместе с действием (решение Р-463).
 */
export async function record(actor: Actor | null, input: AuditInput, db: Db = prisma): Promise<void> {
  await db.auditEvent.create({
    data: {
      actorId: actor?.id ?? null,
      actorRole: actor?.role ?? null,
      actorIp: input.ip ?? null,
      action: input.action,
      objectType: input.objectType,
      objectId: input.objectId ?? null,
      projectId: input.projectId ?? null,
      payload: (input.payload ?? undefined) as never,
    },
  });
}
