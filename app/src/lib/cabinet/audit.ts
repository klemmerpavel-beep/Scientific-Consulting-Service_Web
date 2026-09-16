import { prisma } from '../db.ts';
import type { Actor } from './access.ts';

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

export async function record(actor: Actor | null, input: AuditInput): Promise<void> {
  await prisma.auditEvent.create({
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
