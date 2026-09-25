import { prisma } from '../db.ts';
import { can, ensure, scopeComments, scopeProjects, type Actor } from './access.ts';
import { record } from './audit.ts';
import { enqueue } from './outbox.ts';
import { projectRef } from './projects.ts';
import { materialKey, sha256, storage } from './storage.ts';

/**
 * Материалы и их версии.
 *
 * Версия неизменяема: замены содержимого нет, повторная загрузка порождает
 * следующий номер. Клиент видит один материал с историей v1 → v2 → v3, а не
 * три отдельных файла, и к каждой версии привязаны свои комментарии — видно,
 * что именно изменилось и почему.
 */

/** Предел размера одной версии. Материалы кабинета — документы, не архивы. */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

/**
 * Вид материала. Рабочие материалы этапа и закрывающие документы живут
 * одной сущностью: у них общая история версий, общий журнал доступа и
 * общая выдача байтов. Различается привязка — материал этапа висит на
 * этапе, договор на договоре, счёт и акт на транше.
 */
export type MaterialKind = 'STAGE_MATERIAL' | 'CONTRACT' | 'INVOICE' | 'ACT' | 'OTHER';

export const MATERIAL_KIND_LABEL: Record<MaterialKind, string> = {
  STAGE_MATERIAL: 'материал работы',
  CONTRACT: 'договор',
  INVOICE: 'счёт',
  ACT: 'акт',
  OTHER: 'документ',
};

export interface UploadInput {
  readonly projectId: string;
  readonly stageId?: string | null;
  /** Существующий материал: загрузка следующей версии. */
  readonly materialId?: string | null;
  readonly title?: string;
  readonly kind?: MaterialKind;
  /** Договор, к которому относится файл договора. */
  readonly contractId?: string | null;
  /** Транш, к которому относятся счёт и акт. */
  readonly trancheId?: string | null;
  readonly originalName: string;
  readonly contentType: string;
  readonly body: Buffer;
}

export async function uploadVersion(actor: Actor, input: UploadInput, ip?: string | null) {
  const ref = await projectRef(input.projectId);
  if (ref === null) throw new Error('Проект не найден');

  // Следующая версия ложится в существующий материал, и всё о нём берётся
  // из базы, а не из формы. Прежде вид материала приходил с формы, а
  // принадлежность работе не проверялась: клиент, не указав вида, добавлял
  // версию к своему договору или акту под правом загрузки материалов, а
  // подставив чужой материал — клал файл в чужую работу (решение Р-222).
  const existing =
    input.materialId == null
      ? null
      : await prisma.material.findUnique({
          where: { id: input.materialId },
          select: { projectId: true, kind: true, deletedAt: true },
        });
  if (
    input.materialId != null &&
    (existing === null || existing.projectId !== input.projectId || existing.deletedAt !== null)
  ) {
    throw new Error('Материал не найден');
  }
  if (existing === null && input.stageId != null) {
    const stage = await prisma.stage.findUnique({
      where: { id: input.stageId },
      select: { projectId: true },
    });
    if (stage === null || stage.projectId !== input.projectId) throw new Error('Этап не найден');
  }

  // Закрывающие документы — часть финансового контура, а не производства:
  // договор, счёт и акт заводит тот же, кто ведёт деньги. Иначе клиент мог
  // бы приложить свой «акт» к чужому траншу.
  const kind = existing?.kind ?? input.kind ?? 'STAGE_MATERIAL';
  ensure(actor, kind === 'STAGE_MATERIAL' ? 'MATERIAL_UPLOAD' : 'PAYMENT_EDIT', ref);

  if (input.body.byteLength === 0) throw new Error('Пустой файл не принимается');
  if (input.body.byteLength > MAX_UPLOAD_BYTES) {
    throw new Error(`Файл больше допустимых ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} МБ`);
  }

  // Номер версии вычисляется и занимается в одной транзакции; от гонки
  // защищает уникальность пары «материал — номер» на стороне базы.
  const { version, material, fresh, eventId } = await prisma.$transaction(async (tx) => {
    const current =
      input.materialId == null
        ? null
        : await tx.material.findUnique({ where: { id: input.materialId } });

    const target =
      current ??
      (await tx.material.create({
        data: {
          projectId: input.projectId,
          stageId: input.stageId ?? null,
          kind,
          contractId: input.contractId ?? null,
          trancheId: input.trancheId ?? null,
          title: (input.title ?? input.originalName).trim(),
          createdById: actor.id,
        },
      }));

    const last = await tx.materialVersion.findFirst({
      where: { materialId: target.id },
      orderBy: { number: 'desc' },
      select: { number: true },
    });
    const number = (last?.number ?? 0) + 1;

    const created = await tx.materialVersion.create({
      data: {
        materialId: target.id,
        number,
        storageKey: materialKey(input.projectId, target.id, number, input.originalName),
        originalName: input.originalName.slice(0, 300),
        sizeBytes: BigInt(input.body.byteLength),
        sha256: sha256(input.body),
        contentType: input.contentType.slice(0, 128),
        uploadedById: actor.id,
      },
    });

    const event = await tx.projectEvent.create({
      data: {
        projectId: input.projectId,
        actorId: actor.id,
        kind: 'VERSION_UPLOADED',
        payload: { materialId: target.id, version: number },
      },
      select: { id: true },
    });

    return { version: created, material: target, fresh: current === null, eventId: event.id };
  });

  // Байты пишутся после строки: ключ объекта строится от номера версии,
  // а номер занимается в транзакции. Отказ записи откатывает строку: прежде
  // строка оставалась «последней версией» без объекта, каждое скачивание
  // кончалось ошибкой сервера, а следующая загрузка получала номер через
  // одну (решение Р-237).
  try {
    await storage().put(version.storageKey, input.body, input.contentType);
  } catch (error) {
    await prisma.$transaction(async (tx) => {
      await tx.projectEvent.delete({ where: { id: eventId } });
      await tx.materialVersion.delete({ where: { id: version.id } });
      if (fresh) await tx.material.delete({ where: { id: material.id } });
    });
    throw error;
  }

  await prisma.fileAccessLog.create({
    data: { versionId: version.id, userId: actor.id, action: 'UPLOAD', ip: ip ?? null },
  });

  // О новой версии узнаёт вторая сторона: загрузивший и так знает, что сделал.
  const project = await prisma.project.findUnique({
    where: { id: input.projectId },
    select: {
      code: true,
      title: true,
      clientId: true,
      managerId: true,
      expertId: true,
      client: { select: { userId: true } },
    },
  });
  if (project !== null) {
    // Получатель — тот, кому этот файл можно открыть. Прежде уведомление
    // уходило эксперту о договоре, счёте и акте, которых ему не видно, и
    // эксперту без подписанного соглашения о неразглашении — с названием
    // материала клиента (решение Р-237).
    const permission = material.kind === 'STAGE_MATERIAL' ? 'MATERIAL_VIEW' : 'CONTRACT_VIEW';
    const ref = {
      id: input.projectId,
      clientId: project.clientId,
      managerId: project.managerId,
      expertId: project.expertId,
    };
    const candidates = await prisma.user.findMany({
      where: {
        id: {
          in: [project.client.userId, project.managerId, project.expertId].filter(
            (id): id is string => id !== null && id !== actor.id,
          ),
        },
        status: 'ACTIVE',
      },
      select: {
        id: true,
        role: true,
        status: true,
        clientProfile: { select: { id: true } },
        expertProfile: { select: { ndaSignedAt: true } },
      },
    });
    const recipients = candidates
      .filter((user) =>
        can(
          {
            id: user.id,
            role: user.role,
            status: user.status,
            clientProfileId: user.clientProfile?.id ?? null,
            expertNdaSignedAt: user.expertProfile?.ndaSignedAt ?? null,
          },
          permission,
          ref,
        ),
      )
      .map((user) => user.id);
    for (const userId of recipients) {
      await enqueue(prisma, {
        userId,
        projectId: input.projectId,
        eventKind: 'VERSION_UPLOADED',
        subject: `Новая версия материала: ${material.title}`,
        body:
          `Проект ${project.code} — ${project.title}.\n` +
          `Загружена версия v${version.number}. Открыть можно в личном кабинете.`,
        dedupKey: `version:${version.id}:uploaded:${userId}`,
      });
    }
  }
  await record(actor, {
    action: 'VERSION_UPLOADED',
    objectType: 'MaterialVersion',
    objectId: version.id,
    projectId: input.projectId,
    payload: { material: material.id, version: version.number },
    ip,
  });

  return version;
}

/**
 * Выдать содержимое версии. Единственный путь к байтам: сначала разрешение,
 * затем запись в журнал доступа, и только потом чтение из хранилища.
 */
export async function readVersion(actor: Actor, versionId: string, ip?: string | null) {
  const version = await prisma.materialVersion.findUnique({
    where: { id: versionId },
    include: {
      material: {
        include: {
          project: { select: { id: true, clientId: true, managerId: true, expertId: true } },
        },
      },
    },
  });
  if (version === null) return null;
  if (version.purgedAt !== null) return null;
  // Удалённый материал в перечнях не виден никому, кроме руководителя, —
  // и скачиваться по старой ссылке не должен (решение Р-237).
  if (version.material.deletedAt !== null && actor.role !== 'HEAD') return null;
  // Договор, счёт и акт — финансовый контур: их видит тот, кому открыт
  // договор. Прежде выдача проверяла только право на материалы, и эксперт
  // работы скачивал акт по номеру версии (решение Р-237).
  ensure(
    actor,
    version.material.kind === 'STAGE_MATERIAL' ? 'MATERIAL_VIEW' : 'CONTRACT_VIEW',
    version.material.project,
  );

  await prisma.fileAccessLog.create({
    data: { versionId, userId: actor.id, action: 'DOWNLOAD', ip: ip ?? null },
  });

  return {
    body: await storage().get(version.storageKey),
    originalName: version.originalName,
    contentType: version.contentType,
  };
}

/**
 * Комментарий к версии. Комментарий эксперта клиенту не виден до публикации
 * менеджером; комментарий клиента, менеджера и руководителя публикуется
 * сразу.
 *
 * Модерация стоит между экспертом и клиентом — против прямого выхода
 * эксперта на клиента. Замечание самого клиента прежде тоже уходило на
 * модерацию: у него на экране стояло «ожидает публикации», у куратора —
 * кнопка «Опубликовать клиенту» над его же текстом, а публикация слала
 * клиенту «Эксперт оставил замечание» о том, что он написал сам
 * (решение Р-226).
 */
export async function addComment(actor: Actor, versionId: string, body: string) {
  const version = await prisma.materialVersion.findUnique({
    where: { id: versionId },
    include: {
      material: {
        include: {
          project: { select: { id: true, clientId: true, managerId: true, expertId: true } },
        },
      },
    },
  });
  if (version === null) throw new Error('Версия не найдена');
  ensure(actor, 'COMMENT_CREATE', version.material.project);

  const text = body.trim();
  if (text.length === 0) throw new Error('Пустой комментарий не сохраняется');

  const published = actor.role !== 'EXPERT';
  return prisma.versionComment.create({
    data: {
      versionId,
      authorId: actor.id,
      body: text,
      moderationStatus: published ? 'PUBLISHED' : 'PENDING',
      moderatedById: published ? actor.id : null,
      moderatedAt: published ? new Date() : null,
      publishedAt: published ? new Date() : null,
    },
  });
}

export async function moderateComment(
  actor: Actor,
  commentId: string,
  decision: 'PUBLISHED' | 'REJECTED',
  note?: string | null,
) {
  // Сначала право по роли — чтобы клиент не узнавал, есть ли такое
  // замечание, — затем по работе: замечание публикует куратор его работы,
  // а не любой менеджер (решение Р-220).
  ensure(actor, 'COMMENT_MODERATE');
  const target = await prisma.versionComment.findUnique({
    where: { id: commentId },
    select: {
      version: {
        select: {
          material: {
            select: {
              project: { select: { id: true, clientId: true, managerId: true, expertId: true } },
            },
          },
        },
      },
    },
  });
  if (target === null) throw new Error('Замечание не найдено');
  ensure(actor, 'COMMENT_MODERATE', target.version.material.project);
  const now = new Date();
  // Разобрать можно только ждущее решения: вкладка, открытая до
  // публикации, иначе отклонила бы замечание, о котором клиенту уже
  // сообщили (решение Р-226).
  const reason = note?.trim() || null;
  const { count } = await prisma.versionComment.updateMany({
    where: { id: commentId, moderationStatus: 'PENDING' },
    data: {
      moderationStatus: decision,
      moderatedById: actor.id,
      moderatedAt: now,
      moderationNote: decision === 'REJECTED' ? reason : null,
      publishedAt: decision === 'PUBLISHED' ? now : null,
    },
  });
  if (count === 0) throw new Error('Замечание уже разобрано');
  const comment = await prisma.versionComment.findUniqueOrThrow({ where: { id: commentId } });
  await record(actor, {
    action: decision === 'PUBLISHED' ? 'COMMENT_PUBLISHED' : 'COMMENT_REJECTED',
    objectType: 'VersionComment',
    objectId: commentId,
  });

  if (decision === 'PUBLISHED') {
    const context = await prisma.versionComment.findUnique({
      where: { id: commentId },
      select: {
        version: {
          select: {
            material: {
              select: {
                title: true,
                project: {
                  select: { id: true, code: true, title: true, client: { select: { userId: true } } },
                },
              },
            },
          },
        },
      },
    });
    const project = context?.version.material.project;
    const userId = project?.client.userId ?? null;
    if (project !== undefined && userId !== null) {
      await enqueue(prisma, {
        userId,
        projectId: project.id,
        eventKind: 'EXPERT_COMMENT_PUBLISHED',
        subject: 'Эксперт оставил замечание по материалу',
        body:
          `Проект ${project.code} — ${project.title}.\n` +
          `Материал «${context?.version.material.title}». Замечание видно в кабинете.`,
        dedupKey: `comment:${commentId}:published`,
      });
    }
  }

  return comment;
}

/** Комментарии, видимые этой роли. Сужение выборки, а не скрытие в разметке. */
export async function listComments(actor: Actor, versionId: string) {
  const scope = scopeComments(actor);
  if (scope === null) return [];
  return prisma.versionComment.findMany({
    where: { versionId, ...scope },
    orderBy: { createdAt: 'asc' },
  });
}

/** Замечание, ждущее публикации: работа, этап и кто его оставил. */
export interface PendingComment {
  readonly stageId: string | null;
  readonly projectTitle: string;
  readonly stageTitle: string;
  readonly material: string;
  readonly count: number;
}

/**
 * Замечания экспертов, ждущие публикации.
 *
 * Замечание эксперта создаётся неопубликованным и клиенту не видно, пока
 * менеджер его не пропустит. Кнопки публикации стоят внутри этапа, а
 * очереди не было нигде: узнать о висящем замечании можно было, только
 * открыв этап наугад (решение Р-183). Выборка идёт через `scopeProjects`,
 * поэтому менеджер видит только свои работы.
 *
 * Считается по этапам: в блоке «Требует внимания» запись ведёт на этап,
 * где замечание и публикуется.
 */
export async function pendingComments(actor: Actor): Promise<PendingComment[]> {
  if (!can(actor, 'COMMENT_MODERATE')) return [];
  const scope = scopeProjects(actor);
  if (scope === null) return [];

  const rows = await prisma.versionComment.findMany({
    where: {
      moderationStatus: 'PENDING',
      version: { material: { project: scope } },
    },
    orderBy: { createdAt: 'asc' },
    select: {
      version: {
        select: {
          material: {
            select: {
              title: true,
              stageId: true,
              stage: { select: { id: true, title: true } },
              project: { select: { title: true } },
            },
          },
        },
      },
    },
  });

  // Замечания сводятся по этапу: три замечания к одной версии — это одно
  // дело, а не три записи в перечне.
  const byStage = new Map<string, PendingComment>();
  for (const row of rows) {
    const material = row.version.material;
    const key = material.stage?.id ?? `material:${material.title}`;
    const seen = byStage.get(key);
    if (seen === undefined) {
      byStage.set(key, {
        stageId: material.stage?.id ?? null,
        projectTitle: material.project.title,
        stageTitle: material.stage?.title ?? material.title,
        material: material.title,
        count: 1,
      });
    } else {
      byStage.set(key, { ...seen, count: seen.count + 1 });
    }
  }
  return [...byStage.values()];
}
