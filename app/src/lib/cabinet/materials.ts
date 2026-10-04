import { prisma } from '../db.ts';
import {
  can,
  ensure,
  ensureContributionOpen,
  scopeComments,
  scopeProjects,
  versionVisible,
  type Actor,
} from './access.ts';
import { record } from './audit.ts';
import { hasContacts } from './contacts.ts';
import { fileRefusal } from './file-guard.ts';
import { enqueue, notifyCurator } from './outbox.ts';
import { stageLink } from './approval.ts';
import { siteUrl } from '../site-url.ts';
import { projectRef } from './projects.ts';
import { materialKey, openObject, sha256, storage } from './storage.ts';

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

const MATERIAL_KINDS: readonly MaterialKind[] = ['STAGE_MATERIAL', 'CONTRACT', 'INVOICE', 'ACT', 'OTHER'];

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
          select: { projectId: true, kind: true, deletedAt: true, stageId: true },
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
  // Закрытая работа и завершённый этап — только чтение; документы оплат
  // правилом не закрыты (требования Т-17, М-10, решение Р-293).
  if (kind === 'STAGE_MATERIAL') {
    const stageId = existing === null ? (input.stageId ?? null) : existing.stageId;
    const [work, stage] = await Promise.all([
      prisma.project.findUnique({ where: { id: input.projectId }, select: { status: true } }),
      stageId === null ? null : prisma.stage.findUnique({ where: { id: stageId }, select: { state: true } }),
    ]);
    ensureContributionOpen(actor, work?.status ?? 'ACTIVE', stage?.state ?? null);
  }

  // Вид — из закрытого перечня, привязка документа — к договору и траншу
  // этой же работы. Прежде вид с формы шёл в базу как есть (мусорное
  // значение давало общий экран сбоя), а транш чужой работы принимался, и
  // документ появлялся в её перечне траншей (решение Р-244).
  if (!MATERIAL_KINDS.includes(kind)) throw new Error('Неизвестный вид документа');
  let contractId: string | null = null;
  let trancheId: string | null = null;
  if (existing === null && kind !== 'STAGE_MATERIAL') {
    if (input.trancheId != null) {
      const tranche = await prisma.tranche.findUnique({
        where: { id: input.trancheId },
        select: { contract: { select: { projectId: true } } },
      });
      if (tranche === null || tranche.contract.projectId !== input.projectId) {
        throw new Error('Транш не найден');
      }
      trancheId = input.trancheId;
    }
    if (input.contractId != null) {
      const contract = await prisma.contract.findUnique({
        where: { id: input.contractId },
        select: { projectId: true },
      });
      if (contract === null || contract.projectId !== input.projectId) {
        throw new Error('Договор не найден');
      }
      contractId = input.contractId;
    }
  }
  // Новые файлы к работе обезличенного клиента не прикладываются: имя
  // файла — тоже свободный текст (решения Р-234, Р-244).
  const owner = await prisma.project.findUnique({
    where: { id: input.projectId },
    select: { client: { select: { erasedAt: true } } },
  });
  if (owner?.client.erasedAt != null) {
    throw new Error('Данные клиента удалены по его требованию: новые файлы к работе не прикладываются');
  }

  // Название нового материала видит другая сторона: клиент — эксперт,
  // эксперт — клиент. Контакт в названии обходил и модерацию замечаний, и
  // единственный канал переписки (решение Р-242). Имя файла проверяется у
  // любой версии, а не только у первой: история версий показывает имя
  // каждой, и контакт уходил второй версией к уже названному материалу
  // (решение Р-251).
  if (actor.role === 'CLIENT' || actor.role === 'EXPERT') {
    const names = [input.originalName, ...(input.title === undefined ? [] : [input.title])];
    if (names.some((name) => hasContacts(name.trim()))) {
      throw new Error(
        'В названии материала или имени файла есть телефон, адрес или ссылка на мессенджер: переименуйте файл или задайте название без них',
      );
    }
  }

  if (input.body.byteLength === 0) throw new Error('Пустой файл не принимается');
  if (input.body.byteLength > MAX_UPLOAD_BYTES) {
    throw new Error(`Файл больше допустимых ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} МБ`);
  }
  // Исполняемые файлы и установщики не принимаются ни от кого — по
  // расширению и по содержимому (требование Т-22, решение Р-296).
  const refusal = fileRefusal(input.originalName, input.body);
  if (refusal !== null) throw new Error(refusal);

  // Версия эксперта клиенту не видна до публикации куратором: строка
  // модерации ставится вместе с версией, а событие в истории клиента и
  // письмо ему — в момент публикации (требование Т-18, решение Р-294).
  const moderated = actor.role === 'EXPERT' && kind === 'STAGE_MATERIAL';

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
          contractId,
          trancheId,
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
    if (moderated) await tx.versionModeration.create({ data: { versionId: created.id } });

    const event = moderated
      ? null
      : await tx.projectEvent.create({
          data: {
            projectId: input.projectId,
            actorId: actor.id,
            kind: 'VERSION_UPLOADED',
            payload: { materialId: target.id, version: number },
          },
          select: { id: true },
        });

    return { version: created, material: target, fresh: current === null, eventId: event?.id ?? null };
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
      if (eventId !== null) await tx.projectEvent.delete({ where: { id: eventId } });
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
      // Клиент о версии на публикации не узнаёт: она ему не видна (Р-294).
      .filter((user) => !moderated || user.role !== 'CLIENT')
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
          `Загружена версия v${version.number}. Открыть можно в личном кабинете.` +
          (moderated ? '\nВерсия эксперта ждёт публикации: клиент увидит её после вашего решения.' : ''),
        dedupKey: `version:${version.id}:uploaded:${userId}`,
        path: materialPath(project.code, material.stageId),
      });
    }
  }
  await record(actor, {
    action: 'VERSION_UPLOADED',
    objectType: 'MaterialVersion',
    objectId: version.id,
    projectId: input.projectId,
    payload: { material: material.id, version: version.number, ...(moderated ? { moderated: true } : {}) },
    ip,
  });

  return version;
}

/**
 * Опубликовать версию эксперта клиенту или не публиковать (требование
 * Т-18, решение Р-294). Тот же круг, что у замечаний: куратор работы и
 * руководитель (Р-220). В закрытой работе разбора нет (Р-293).
 *
 * При публикации клиент получает письмо «Новая версия материала», в
 * истории работы появляется событие, а пояснения эксперта к этой версии
 * без контактов публикуются вместе с ней: замечание к невидимой версии
 * отдельно не публикуется.
 */
export async function moderateVersion(
  actor: Actor,
  versionId: string,
  decision: 'PUBLISHED' | 'REJECTED',
  note?: string | null,
) {
  ensure(actor, 'COMMENT_MODERATE');
  const target = await prisma.versionModeration.findUnique({
    where: { versionId },
    select: {
      version: {
        select: {
          id: true,
          number: true,
          uploadedById: true,
          material: {
            select: {
              id: true,
              title: true,
              stageId: true,
              project: {
                select: {
                  id: true,
                  code: true,
                  title: true,
                  status: true,
                  clientId: true,
                  managerId: true,
                  expertId: true,
                  client: { select: { userId: true } },
                },
              },
            },
          },
        },
      },
    },
  });
  if (target === null) throw new Error('Версия не ждёт публикации');
  const { version } = target;
  const project = version.material.project;
  ensure(actor, 'COMMENT_MODERATE', project);
  ensureContributionOpen(actor, project.status, null);
  const reason = note?.trim() || null;
  if (reason !== null && reason.length > 2000) throw new Error('Причина — не длиннее 2000 знаков');
  // «Не публиковать» — с причиной: эксперт получает её письмом и
  // исправляет версию (требование М-14, ОМ-15).
  if (decision === 'REJECTED' && reason === null) {
    throw new Error('Не публиковать версию можно только с причиной: эксперт получит её письмом');
  }

  const now = new Date();
  const published = await prisma.$transaction(async (tx) => {
    const { count } = await tx.versionModeration.updateMany({
      where: { versionId, status: 'PENDING' },
      data: {
        status: decision,
        decidedById: actor.id,
        decidedAt: now,
        note: decision === 'REJECTED' ? reason : null,
      },
    });
    if (count === 0) throw new Error('Версия уже разобрана');
    if (decision !== 'PUBLISHED') {
      await enqueue(tx, {
        userId: version.uploadedById,
        projectId: project.id,
        eventKind: 'VERSION_REJECTED',
        subject: `Версия v${version.number} не опубликована: ${version.material.title}`,
        body:
          `Проект ${project.code} — ${project.title}.\n` +
          `Менеджер не опубликовал клиенту версию v${version.number} материала «${version.material.title}».\n` +
          `Причина: ${reason}\n` +
          'Исправленную версию можно загрузить в личном кабинете.',
        dedupKey: `version:${version.id}:rejected`,
        path: materialPath(project.code, version.material.stageId),
      });
      return 0;
    }

    await tx.projectEvent.create({
      data: {
        projectId: project.id,
        actorId: version.uploadedById,
        kind: 'VERSION_UPLOADED',
        payload: { materialId: version.material.id, version: version.number },
      },
    });
    // Пояснения эксперта к версии — вместе с ней; с контактами остаются на
    // отдельный разбор (Р-242).
    const notes = await tx.versionComment.findMany({
      where: { versionId, authorId: version.uploadedById, moderationStatus: 'PENDING' },
      select: { id: true, body: true },
    });
    const clean = notes.filter((comment) => !hasContacts(comment.body)).map((comment) => comment.id);
    if (clean.length > 0) {
      await tx.versionComment.updateMany({
        where: { id: { in: clean }, moderationStatus: 'PENDING' },
        data: { moderationStatus: 'PUBLISHED', moderatedById: actor.id, moderatedAt: now, publishedAt: now },
      });
    }
    // Эксперту — что версия ушла клиенту (требование М-08, решение Р-301).
    await enqueue(tx, {
      userId: version.uploadedById,
      projectId: project.id,
      eventKind: 'EXPERT_DECISION',
      subject: `Версия v${version.number} опубликована: ${version.material.title}`,
      body: `Работа ${project.code}.\nМенеджер опубликовал клиенту версию v${version.number} материала «${version.material.title}».`,
      dedupKey: `version:${version.id}:published:expert`,
      path: materialPath(project.code, version.material.stageId),
    });
    if (project.client.userId !== null) {
      await enqueue(tx, {
        userId: project.client.userId,
        projectId: project.id,
        eventKind: 'VERSION_UPLOADED',
        subject: `Новая версия материала: ${version.material.title}`,
        body:
          `Проект ${project.code} — ${project.title}.\n` +
          `Загружена версия v${version.number}. Открыть можно в личном кабинете.`,
        dedupKey: `version:${version.id}:uploaded:${project.client.userId}`,
        path: materialPath(project.code, version.material.stageId),
      });
    }
    return clean.length;
  });

  await record(actor, {
    action: decision === 'PUBLISHED' ? 'VERSION_PUBLISHED' : 'VERSION_REJECTED',
    objectType: 'MaterialVersion',
    objectId: version.id,
    projectId: project.id,
    payload: decision === 'PUBLISHED' ? { comments: published } : { withNote: reason !== null },
  });
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
      moderation: { select: { status: true } },
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
  // Неопубликованная версия эксперта — «не найдено», как и в перечнях
  // (требование Т-18, решение Р-294).
  if (!versionVisible(actor, version)) return null;

  await prisma.fileAccessLog.create({
    data: { versionId, userId: actor.id, action: 'DOWNLOAD', ip: ip ?? null },
  });

  // Потоком, а не целиком (решение Р-247).
  const opened = await openObject(storage(), version.storageKey);
  return {
    stream: opened.stream,
    sizeBytes: opened.sizeBytes,
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
          project: {
            select: {
              id: true,
              code: true,
              title: true,
              clientId: true,
              managerId: true,
              expertId: true,
              status: true,
            },
          },
          stage: { select: { state: true } },
        },
      },
      moderation: { select: { status: true } },
    },
  });
  if (version === null) throw new Error('Версия не найдена');
  ensure(actor, 'COMMENT_CREATE', version.material.project);
  // К невидимой версии эксперта клиент замечаний не пишет (Т-18, Р-294).
  if (!versionVisible(actor, version)) throw new Error('Версия не найдена');
  // Закрытая работа и завершённый этап — только чтение (Т-17, М-10, Р-293).
  ensureContributionOpen(actor, version.material.project.status, version.material.stage?.state ?? null);
  // Замечание — к тому, что можно открыть. Договор, счёт и акт видны по
  // праву на договор, а не на материалы: эксперт, которому они закрыты,
  // зная номер версии, оставлял к ним замечание (решение Р-251).
  if (version.material.kind !== 'STAGE_MATERIAL') {
    ensure(actor, 'CONTRACT_VIEW', version.material.project);
  }
  // К удалённому материалу и изъятой версии замечаний не пишут: на экране
  // их уже нет, и замечание повисало бы без предмета (решение Р-251).
  if (version.material.deletedAt !== null) throw new Error('Материал удалён: замечание к нему не принимается');
  if (version.purgedAt !== null) throw new Error('Версия изъята: замечание к ней не принимается');

  const text = body.trim();
  if (text.length === 0) throw new Error('Пустой комментарий не сохраняется');
  if (text.length > COMMENT_MAX) {
    throw new Error(`Замечание длиннее ${COMMENT_MAX} знаков: разделите его на несколько`);
  }

  // Замечание эксперта всегда проходит модерацию. Замечание клиента с
  // телефоном, адресом или ссылкой на мессенджер — тоже: прежде оно сразу
  // становилось видно назначенному эксперту, и контакт уходил в обход
  // куратора (решение Р-242). Автор видит своё замечание с отметкой
  // «ожидает публикации».
  const contactHint = hasContacts(text);
  const held = actor.role === 'EXPERT' || (actor.role === 'CLIENT' && contactHint);
  const published = !held;
  const comment = await prisma.versionComment.create({
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
  // Куратору — сигнал без текста (требование М-07, решение Р-300):
  // замечание на модерации — одно письмо, пока в работе есть неразобранное;
  // замечание клиента, опубликованное сразу, — каждое.
  const project = version.material.project;
  const where =
    version.material.stageId === null
      ? materialsLink(project.code)
      : stageLink(version.material.stageId);
  if (held) {
    const [otherComments, versions] = await Promise.all([
      prisma.versionComment.count({
        where: {
          id: { not: comment.id },
          moderationStatus: 'PENDING',
          version: { material: { projectId: project.id, deletedAt: null } },
        },
      }),
      prisma.versionModeration.count({
        where: { status: 'PENDING', version: { material: { projectId: project.id, deletedAt: null } } },
      }),
    ]);
    if (otherComments + versions === 0) {
      await notifyCurator(prisma, {
        projectId: project.id,
        actorId: actor.id,
        eventKind: 'MODERATION_PENDING',
        subject: `Ждут публикации: ${project.code}`,
        body:
          `Работа ${project.code} — ${project.title}.\n` +
          'Появились замечания или версии эксперта, которые ждут вашего решения: до него клиент их не видит.\n' +
          where,
        key: `moderation:${project.id}:${comment.id}`,
        path: materialPath(project.code, version.material.stageId),
      });
    }
  } else if (actor.role === 'CLIENT') {
    await notifyCurator(prisma, {
      projectId: project.id,
      actorId: actor.id,
      eventKind: 'CLIENT_COMMENT',
      subject: `Клиент оставил замечание: ${version.material.title}`,
      body:
        `Работа ${project.code} — ${project.title}.\n` +
        `Клиент оставил замечание к версии v${version.number} материала «${version.material.title}». Текст — в кабинете.\n` +
        where,
      key: `comment:${comment.id}:client`,
      path: materialPath(project.code, version.material.stageId),
    });
  }

  // В журнал — факт и признаки, без текста (решения Р-234, Р-239).
  await record(actor, {
    action: 'COMMENT_CREATED',
    objectType: 'VersionComment',
    objectId: comment.id,
    projectId: version.material.project.id,
    payload: { held, contactHint },
  });
  return comment;
}

/** Предел длины замечания: больше — уже документ, а не замечание. */
export const COMMENT_MAX = 10_000;

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
      authorId: true,
      moderationStatus: true,
      author: { select: { role: true } },
      version: {
        select: {
          number: true,
          moderation: { select: { status: true } },
          material: {
            select: {
              title: true,
              stageId: true,
              project: {
                select: { id: true, code: true, clientId: true, managerId: true, expertId: true, status: true },
              },
            },
          },
        },
      },
    },
  });
  if (target === null) throw new Error('Замечание не найдено');
  ensure(actor, 'COMMENT_MODERATE', target.version.material.project);
  // Разбор замечаний закрытой работы закрыт и практике (М-10, Р-293).
  ensureContributionOpen(actor, target.version.material.project.status, null);
  // Замечание к версии, которую клиент не видит, отдельно не публикуется:
  // оно уходит вместе с версией (требование Т-18, решение Р-294).
  if (
    decision === 'PUBLISHED' &&
    target.version.moderation !== null &&
    target.version.moderation.status !== 'PUBLISHED'
  ) {
    throw new Error('Замечание к неопубликованной версии публикуется вместе с версией');
  }
  const now = new Date();
  // Разобрать можно только ждущее решения: вкладка, открытая до
  // публикации, иначе отклонила бы замечание, о котором клиенту уже
  // сообщили (решение Р-226).
  const reason = note?.trim() || null;
  if (target.moderationStatus !== 'PENDING') throw new Error('Замечание уже разобрано');
  // Замечание эксперта отклоняется с причиной: эксперт получает её письмом
  // (требование М-08, ОМ-15, решение Р-301).
  if (decision === 'REJECTED' && target.author.role === 'EXPERT' && reason === null) {
    throw new Error('Не публиковать замечание эксперта можно только с причиной: эксперт получит её письмом');
  }
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
  // Эксперт узнаёт решение по своему замечанию (М-08, Р-301).
  if (target.author.role === 'EXPERT') {
    const { material } = target.version;
    await enqueue(prisma, {
      userId: target.authorId,
      projectId: material.project.id,
      eventKind: 'EXPERT_DECISION',
      subject:
        decision === 'PUBLISHED'
          ? `Ваше замечание опубликовано: ${material.title}`
          : `Ваше замечание не опубликовано: ${material.title}`,
      body:
        `Работа ${material.project.code}.\n` +
        (decision === 'PUBLISHED'
          ? `Менеджер опубликовал клиенту ваше замечание к версии v${target.version.number} материала «${material.title}».`
          : `Менеджер не опубликовал ваше замечание к версии v${target.version.number} материала «${material.title}».\nПричина: ${reason}`),
      // Своё пространство ключей: письма клиенту о замечании начинаются с
      // `comment:<id>` (решение Р-242).
      dedupKey: `expert-decision:comment:${commentId}`,
      path: materialPath(material.project.code, material.stageId),
    });
  }

  // Письмо «эксперт оставил замечание» уходит клиенту, только если автор —
  // эксперт: своё же замечание клиенту пересылать незачем (решение Р-242).
  if (decision === 'PUBLISHED' && target.author.role === 'EXPERT') {
    const context = await prisma.versionComment.findUnique({
      where: { id: commentId },
      select: {
        version: {
          select: {
            material: {
              select: {
                title: true,
                stageId: true,
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
        path: materialPath(project.code, context?.version.material.stageId ?? null),
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
  /** Код работы и материал — для ссылки на «Материалы работы» (решение Р-284). */
  readonly projectCode: string;
  readonly materialId: string;
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
      // Замечания к документам оплат разобрать негде, и делом они не
      // становятся (решение Р-284).
      version: { material: { project: scope, kind: 'STAGE_MATERIAL' } },
    },
    orderBy: { createdAt: 'asc' },
    select: {
      version: {
        select: {
          material: {
            select: {
              id: true,
              title: true,
              stageId: true,
              stage: { select: { id: true, title: true } },
              project: { select: { title: true, code: true } },
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
    // Вне этапа — по материалу, а не по его названию: одноимённые
    // материалы разных работ сливались в одно дело (решение Р-284).
    const key = material.stage?.id ?? `material:${material.id}`;
    const seen = byStage.get(key);
    if (seen === undefined) {
      byStage.set(key, {
        stageId: material.stage?.id ?? null,
        projectCode: material.project.code,
        materialId: material.id,
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

/**
 * Версии эксперта, ждущие публикации, — дело куратора на «Требует
 * внимания» (требование Т-18, решение Р-294). Сводятся по этапу, как
 * замечания: три версии одного этапа — одно дело.
 */
export async function pendingVersions(actor: Actor): Promise<PendingComment[]> {
  if (!can(actor, 'COMMENT_MODERATE')) return [];
  const scope = scopeProjects(actor);
  if (scope === null) return [];
  const rows = await prisma.versionModeration.findMany({
    where: {
      status: 'PENDING',
      version: { purgedAt: null, material: { project: { ...scope, status: { in: ['ACTIVE', 'PAUSED'] } }, deletedAt: null } },
    },
    orderBy: { createdAt: 'asc' },
    select: {
      version: {
        select: {
          material: {
            select: {
              id: true,
              title: true,
              stage: { select: { id: true, title: true } },
              project: { select: { title: true, code: true } },
            },
          },
        },
      },
    },
  });
  const byStage = new Map<string, PendingComment>();
  for (const row of rows) {
    const material = row.version.material;
    const key = material.stage?.id ?? `material:${material.id}`;
    const seen = byStage.get(key);
    byStage.set(
      key,
      seen === undefined
        ? {
            stageId: material.stage?.id ?? null,
            projectCode: material.project.code,
            materialId: material.id,
            projectTitle: material.project.title,
            stageTitle: material.stage?.title ?? material.title,
            material: material.title,
            count: 1,
          }
        : { ...seen, count: seen.count + 1 },
    );
  }
  return [...byStage.values()];
}

/** Строка письма со ссылкой на «Материалы работы» (решение Р-300). */
/**
 * Экран материала для кнопки письма: этап, если материал к этапу, иначе
 * «Материалы работы» (требование Т-06, решение Р-309).
 */
function materialPath(code: string, stageId: string | null): string {
  return stageId === null ? `/cabinet/projects/${code}/materials` : `/cabinet/stages/${stageId}`;
}

function materialsLink(code: string): string {
  const base = siteUrl();
  return base === null
    ? 'Открыть материалы можно в личном кабинете.'
    : `Открыть материалы: ${base}/cabinet/projects/${code}/materials`;
}
