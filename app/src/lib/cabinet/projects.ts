import { prisma } from '../db.ts';
import {
  CLIENT_VISIBLE_VERSION,
  EXPERT_ROLE_LABEL,
  can,
  curatorLine,
  ensure,
  ensureWorkOpen,
  type Actor,
  type ExpertRoleKey,
  type ProjectRef,
} from './access.ts';
import { record } from './audit.ts';
import { declineLetterFor } from './lead-letter.ts';
import { enqueue, enqueueToLead, notifyCurator } from './outbox.ts';
import { materialKey, storage } from './storage.ts';
import { siteUrl } from '../site-url.ts';
import { now } from './clock.ts';
import { moscowToday } from './admin.ts';
import { STAGE_TRANSITIONS, stageLabel } from './stage-state.ts';
import { hasContacts } from './contacts.ts';
import {
  APPROVAL_DAYS_MAX,
  APPROVAL_DAYS_MIN,
  approvalDeadline,
  ensureApprovalOpen,
  formatDay,
  holdApprovalDeadlines,
  loadCalendar,
  resumeApprovalDeadlines,
  stageLink,
} from './approval.ts';
import {
  PROJECT_STATUS_LABEL,
  canChangeProjectStatus,
  isClosedStatus,
  type ProjectStatusKey,
} from './project-status.ts';

/**
 * Производственный контур: модерация заявки, проект, этапы.
 *
 * Все операции проходят через модуль прав: обработчик маршрута не решает,
 * кому что можно, он лишь передаёт сюда действующее лицо.
 */

/** Приведение ФИО к виду, пригодному для поиска дублей. */
export function normalizeName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[.\-_,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Код проекта вида PD-2026-014. */
export function formatProjectCode(year: number, number: number): string {
  return `PD-${year}-${String(number).padStart(3, '0')}`;
}

/**
 * Выдать следующий код года. Инкремент выполняется на стороне базы: два
 * менеджера, одобряющих заявки в одну секунду, получат разные номера, чего
 * не даёт вычисление `max(code) + 1` на стороне приложения.
 */
export async function nextProjectCode(
  tx: { projectCodeCounter: { upsert: (args: unknown) => Promise<{ lastNumber: number }> } },
  year: number,
): Promise<string> {
  const counter = await tx.projectCodeCounter.upsert({
    where: { year },
    create: { year, lastNumber: 1 },
    update: { lastNumber: { increment: 1 } },
  });
  return formatProjectCode(year, counter.lastNumber);
}

export interface ApproveLeadInput {
  readonly leadId: string;
  readonly serviceTypeId: string;
  readonly managerId: string;
  readonly title: string;
  readonly topic?: string | null;
  readonly dueOn?: Date | null;
  /** Применить шаблон этапов этого типа сопровождения. Необязательно. */
  readonly applyStageTemplate?: boolean;
}

/**
 * Одобрить заявку и развернуть её в проект. Заявка при этом не исчезает:
 * она получает ссылку на проект и остаётся в системе навсегда.
 */
export async function approveLead(actor: Actor, input: ApproveLeadInput) {
  ensure(actor, 'REQUEST_MODERATE');

  const lead = await prisma.lead.findUnique({ where: { id: input.leadId } });
  if (lead === null) throw new Error('Заявка не найдена');
  if (lead.projectId !== null) throw new Error('Заявка уже развёрнута в проект');
  // Отклонённому ушло письмо «взяться не можем» (решение Р-217); работа по
  // той же заявке противоречила бы ему. Передумали — нужна новая заявка.
  if (lead.status === 'DECLINED') {
    throw new Error('Заявка отклонена, заявителю уже ответили: работа заводится по новой заявке');
  }
  // Отзыв и обращение без контакта в работу не разворачиваются: учётная
  // запись с пустой почтой собрала бы на себя все такие работы (Р-245).
  if (lead.form === 'review' || lead.contact.trim() === '') {
    throw new Error('Это отзыв или обращение без контакта: работа по нему не заводится');
  }

  // Тип и название проверяются до захвата заявки и словами. Прежде пустое
  // или подставленное значение доходило до базы: несуществующий тип ронял
  // одобрение ошибкой внешнего ключа, выведенный из оборота заводил работу
  // по услуге, которой практика больше не оказывает, а пустое название
  // давало работу без имени в перечнях (решение Р-251).
  const title = input.title.trim();
  if (title.length === 0) throw new Error('Название работы не указано');
  const serviceType = await prisma.serviceType.findUnique({
    where: { id: input.serviceTypeId },
    select: { isActive: true },
  });
  if (serviceType === null) throw new Error('Тип сопровождения не найден: выберите его из списка');
  if (!serviceType.isActive) {
    throw new Error('Тип сопровождения выведен из оборота: выберите действующий');
  }

  const fullName = lead.name?.trim() || 'Клиент без имени';
  const normalized = normalizeName(fullName);
  const email = lead.contactKind === 'email' ? lead.contact.trim().toLowerCase() : null;
  const phone = lead.contactKind === 'phone' ? lead.contact.trim() : null;

  const project = await prisma.$transaction(async (tx) => {
    // Заявка захватывается первой строкой транзакции, по состоянию, а не по
    // прочитанному выше. Прежде два одновременных одобрения проходили
    // проверку оба и заводили две работы с двумя приглашениями, а отказ,
    // пришедший между проверкой и записью, оставлял заявку «отклонённой» с
    // работой при ней (решение Р-240). Захват держит строку до конца
    // транзакции: второй ждёт и не находит заявку свободной.
    const claimed = await tx.lead.updateMany({
      where: { id: lead.id, projectId: null, status: { not: 'DECLINED' } },
      data: { status: 'CONTRACTED' },
    });
    if (claimed.count === 0) {
      throw new Error('Заявку уже разобрали: обновите страницу');
    }

    // Учётная запись клиента заводится только при известном адресе почты:
    // вход в кабинет идёт по ссылке на почту, телефоном войти нельзя.
    let userId: string | null = null;
    // Первое обращение отличается от повторного текстом письма: новому
    // человеку объясняется, что у него вообще есть кабинет, прежнему —
    // только что заведена ещё одна работа. Наличие записи проверяется до
    // upsert: после него отличить созданную от найденной уже нельзя.
    let firstTime = false;
    if (email !== null) {
      const known = await tx.user.findUnique({
        where: { email },
        select: { id: true, role: true, status: true, consentAcceptedAt: true },
      });
      // Адрес заявки может принадлежать сотруднику или закрытой записи.
      // Прежде работа молча вешалась на неё: сотрудник как клиент работы
      // не видит, приостановленный не войдёт, а письмо обещало «работа
      // добавлена в ваш кабинет» (решение Р-238).
      if (known !== null && known.role !== 'CLIENT') {
        throw new Error('Адрес заявки принадлежит сотруднику практики: клиенту нужен свой адрес');
      }
      if (known !== null && known.status !== 'ACTIVE') {
        throw new Error('Учётная запись с адресом заявки закрыта: сначала откройте её');
      }
      firstTime = known === null;
      // Согласие на обработку дано в самой заявке: его момент и редакция
      // переходят в учётную запись. Прежде запись оставалась без согласия,
      // а обращение из кабинета всё равно помечалось согласованным
      // (решение Р-238).
      const consent =
        lead.consentGiven && (known === null || known.consentAcceptedAt === null)
          ? { consentAcceptedAt: lead.createdAt, consentVersion: lead.consentVersion }
          : {};
      const user = await tx.user.upsert({
        where: { email },
        create: { email, fullName, role: 'CLIENT', phone, ...consent },
        update: consent,
      });
      userId = user.id;
    }

    const existing =
      userId === null
        ? null
        : await tx.clientProfile.findUnique({ where: { userId } });

    const client =
      existing ??
      (await tx.clientProfile.create({
        data: {
          userId,
          fullName,
          normalizedName: normalized,
          email,
          phone,
          university: null,
          speciality: lead.speciality ?? null,
        },
      }));

    const code = await nextProjectCode(tx as never, new Date().getUTCFullYear());

    const created = await tx.project.create({
      data: {
        code,
        clientId: client.id,
        serviceTypeId: input.serviceTypeId,
        title,
        topic: input.topic ?? lead.topic ?? null,
        managerId: input.managerId,
        dueOn: input.dueOn ?? null,
        // День начала — день одобрения по Москве. Прежде его ставил только
        // перенос книги, и работы, заведённые в кабинете, выпадали из
        // «Принято за квартал», заказов по месяцам, сезонности, длительности
        // цикла и итогов по годам (решение Р-257).
        startedOn: moscowToday(),
        source: 'WEB',
      },
    });

    await tx.lead.update({
      where: { id: lead.id },
      data: { projectId: created.id, status: 'CONTRACTED' },
    });

    if (input.applyStageTemplate === true) {
      const template = await tx.stageTemplate.findMany({
        where: { serviceTypeId: input.serviceTypeId, isActive: true },
        orderBy: { position: 'asc' },
      });
      if (template.length > 0) {
        await tx.stage.createMany({
          data: templateStages(created.id, template, now()),
        });
      }
    }

    await tx.projectEvent.create({
      data: {
        projectId: created.id,
        actorId: actor.id,
        kind: 'PROJECT_CREATED',
        payload: { code, leadId: lead.id },
      },
    });

    // Клиент узнаёт об одобрении сам, а не после того, как о нём вспомнят.
    // Прежде учётная запись заводилась молча: человек оставлял заявку и
    // больше ничего не слышал, пока менеджер вручную не выдаст ссылку входа.
    //
    // Ссылка входа в письмо не кладётся намеренно. Она одноразовая и живёт
    // пятнадцать минут (`token.ts`), а письмо ждёт ближайшей рассылки и
    // может пролежать дольше: к моменту прочтения ссылка была бы мертва, и
    // приглашение выглядело бы поломкой. Человек открывает кабинет сам и
    // получает свежую ссылку на тот же адрес.
    if (userId !== null) {
      const base = siteUrl();
      const entrance = base === null ? 'страница «Личный кабинет» на сайте' : `${base}/cabinet`;
      await enqueue(tx, {
        userId,
        projectId: created.id,
        eventKind: 'PROJECT_OPENED',
        subject: firstTime
          ? `Заявка принята: работа ${code}`
          : `Заведена новая работа ${code}`,
        body:
          `${title}${created.topic === null ? '' : ` — ${created.topic}`}.\n` +
          (firstTime
            ? 'Ход работы, материалы и переписка с куратором собраны в личном кабинете.\n' +
              `Откройте ${entrance} и укажите этот адрес почты — придёт ссылка для входа.\n` +
              'Пароль не нужен: вход только по ссылке на почту.'
            : `Работа добавлена в ваш личный кабинет: ${entrance}.`),
        // Ключ по работе, а не по времени: одобрение происходит один раз, и
        // второго приглашения по той же работе быть не должно.
        dedupKey: `project:${created.id}:opened`,
      });
    }

    return created;
  });

  await record(actor, {
    action: 'LEAD_APPROVED',
    objectType: 'Lead',
    objectId: lead.id,
    projectId: project.id,
    payload: { code: project.code },
  });

  await moveLeadAttachments(actor, lead.id, project.id);

  return project;
}

/**
 * Вложения заявки переезжают в материалы созданной работы.
 *
 * Иначе файл, ради которого человек и написал, остался бы при заявке:
 * дойти до него можно было бы только через экран разбора, а работа,
 * которую он описывает, о нём не знала бы (решение Р-191).
 *
 * Перенос идёт после транзакции создания работы: он ходит в хранилище, а
 * держать транзакцию открытой на время записи байтов нельзя. Отказ
 * хранилища не отменяет одобрения — файл остаётся при заявке и
 * открывается с её экрана.
 */
async function moveLeadAttachments(actor: Actor, leadId: string, projectId: string) {
  const files = await prisma.leadAttachment.findMany({
    where: { leadId, materialId: null, purgedAt: null },
    orderBy: { uploadedAt: 'asc' },
  });
  if (files.length === 0) return;

  // Каждый файл переносится отдельно и в таком порядке: строки материала
  // и версии, байты, отметка на вложении, удаление исходного объекта.
  // Прежде материал заводился до записи байтов, а исходный объект
  // удалялся до отметки: отказ хранилища оставлял пустой материал в
  // работе, а обрыв между удалением и отметкой — вложение, ведущее на
  // удалённый объект (решение Р-237). Теперь отказ на файле откатывает
  // его строки, файл остаётся при заявке и открывается с экрана заявки;
  // остальные файлы переносятся.
  const store = storage();
  let moved = 0;
  for (const file of files) {
    let created: { materialId: string; versionId: string; key: string } | null = null;
    try {
      const body = await store.get(file.storageKey);
      created = await prisma.$transaction(async (tx) => {
        const material = await tx.material.create({
          data: { projectId, title: file.originalName.slice(0, 300), createdById: actor.id },
        });
        const key = materialKey(projectId, material.id, 1, file.originalName);
        const version = await tx.materialVersion.create({
          data: {
            materialId: material.id,
            number: 1,
            storageKey: key,
            originalName: file.originalName,
            sizeBytes: file.sizeBytes,
            sha256: file.sha256,
            contentType: file.contentType,
            uploadedById: file.uploadedById ?? actor.id,
          },
        });
        return { materialId: material.id, versionId: version.id, key };
      });
      await store.put(created.key, body, file.contentType);
      await prisma.leadAttachment.update({
        where: { id: file.id },
        data: { materialId: created.materialId, purgedAt: new Date() },
      });
      moved += 1;
    } catch (error) {
      console.error('Вложение заявки не перенесено', file.id, error);
      if (created !== null) {
        const { materialId, versionId } = created;
        await prisma
          .$transaction([
            prisma.materialVersion.delete({ where: { id: versionId } }),
            prisma.material.delete({ where: { id: materialId } }),
          ])
          .catch(() => undefined);
      }
      continue;
    }
    // Исходный объект убирается последним: две копии одного файла означали
    // бы два места, откуда его придётся вычищать по требованию субъекта;
    // отказ здесь оставляет лишнюю копию, но не ломает ни заявку, ни работу.
    await store.remove(file.storageKey).catch((error: unknown) => {
      console.error('Исходный объект вложения не удалён', file.id, error);
    });
  }

  await record(actor, {
    action: 'LEAD_FILES_MOVED',
    objectType: 'Lead',
    objectId: leadId,
    projectId,
    payload: { count: moved, failed: files.length - moved },
  });
}

/**
 * Отклонить заявку. Заявка остаётся в системе, а причина уходит заявителю
 * письмом — в той же транзакции, что и сама отметка отказа.
 *
 * Прежде причина записывалась в заявку и дальше не шла: экрана, где
 * заявитель её прочёл бы, нет, а кабинета у отклонённого не будет. Человек
 * оставлял обращение и не получал ответа вовсе (решение Р-217).
 *
 * Возвращает заявку и признак, ушло ли письмо в очередь: у того, кто
 * оставил телефон, адреса нет, и ответ ему — звонком.
 */
export async function declineLead(actor: Actor, leadId: string, reason: string) {
  ensure(actor, 'REQUEST_MODERATE');
  const trimmed = reason.trim();
  if (trimmed.length === 0) {
    throw new Error('Отклонение без причины не принимается: причину получает заявитель');
  }
  const found = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { projectId: true, status: true },
  });
  if (found === null) throw new Error('Заявка не найдена');
  // Отказ по заявке, уже ставшей работой, отправил бы человеку «нет» после
  // приглашения в кабинет.
  if (found.projectId !== null) throw new Error('Заявка уже развёрнута в проект');
  // Повторный отказ переписывал причину, а письмо — по ключу — оставалось
  // прежним: экран показывал новую причину рядом с «письмо ушло», хотя
  // человек получил старую (решение Р-227).
  if (found.status === 'DECLINED') throw new Error('Заявка уже отклонена, заявителю ответили');

  const { lead, queued } = await prisma.$transaction(async (tx) => {
    // Захват по состоянию: одобрение, начатое раньше, держит строку, и
    // отказ после его завершения видит заявку уже развёрнутой (решение
    // Р-240).
    const claimed = await tx.lead.updateMany({
      where: { id: leadId, projectId: null, status: { not: 'DECLINED' } },
      data: { status: 'DECLINED', declineReason: trimmed },
    });
    if (claimed.count === 0) {
      throw new Error('Заявку уже разобрали: обновите страницу');
    }
    const lead = await tx.lead.findUniqueOrThrow({ where: { id: leadId } });
    // Заявке, помеченной при приёме как машинная, письма нет: адрес в ней
    // мог вписать кто угодно, и отказ стал бы способом слать письма на
    // чужой ящик от имени практики.
    const queued =
      found.status !== 'SPAM' &&
      (await enqueueToLead(tx, {
        leadId,
        eventKind: 'LEAD_DECLINED',
        // Имя и тема подставляются только в ответ на заявку из кабинета:
        // адрес заявки с сайта не подтверждён (решение Р-252).
        ...declineLetterFor(lead, trimmed),
        // Ключ по заявке: повторное отклонение с правленой причиной второго
        // письма не отправит — человек уже получил ответ.
        dedupKey: `lead:${leadId}:declined`,
      }));
    return { lead, queued };
  });

  await record(actor, {
    action: 'LEAD_DECLINED',
    objectType: 'Lead',
    objectId: leadId,
    payload: { letter: queued },
  });
  return { lead, queued };
}

/** Реквизиты проекта для модуля прав. */
export async function projectRef(projectId: string): Promise<ProjectRef | null> {
  return prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, clientId: true, managerId: true, expertId: true },
  });
}

export async function assignExpert(
  actor: Actor,
  projectId: string,
  expertId: string | null,
  role?: ExpertRoleKey | null,
) {
  const ref = await projectRef(projectId);
  if (ref === null) throw new Error('Проект не найден');
  ensure(actor, 'PROJECT_ASSIGN_EXPERT', ref);
  const current = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    select: { status: true, expertRole: true },
  });
  // Исполнитель закрытой работы не меняется (М-10, решение Р-293).
  ensureWorkOpen(current.status);
  // Роль эксперта в работе — из закрытого перечня; по умолчанию первая
  // (требование Т-11, О-10, решение Р-297).
  if (role != null && !Object.hasOwn(EXPERT_ROLE_LABEL, role)) throw new Error('Неизвестная роль эксперта');
  const nextRole = expertId === null ? null : (role ?? current.expertRole ?? 'SUBJECT_EXPERT');

  // Экспертом работы может быть только действующий эксперт. Прежде в поле
  // ложился любой идентификатор формы: клиент или сотрудник становился
  // «экспертом», а приостановленный эксперт получал работу, которую не
  // откроет (решение Р-240).
  if (expertId !== null) {
    const target = await prisma.user.findFirst({
      where: { id: expertId, status: 'ACTIVE', role: 'EXPERT' },
      select: { id: true },
    });
    if (target === null) throw new Error('Экспертом может быть только действующий эксперт');
  }
  // Повторное назначение того же эксперта ничего не меняет и в ленту
  // клиента и журнал не пишется; смена одной роли — правка без события.
  if (expertId === ref.expertId) {
    if (nextRole === current.expertRole) {
      return prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    }
    const updated = await prisma.project.update({ where: { id: projectId }, data: { expertRole: nextRole } });
    await record(actor, {
      action: 'PROJECT_EDITED',
      objectType: 'Project',
      objectId: projectId,
      projectId,
      payload: { expertRoleFrom: current.expertRole, expertRoleTo: nextRole },
    });
    return updated;
  }

  const project = await prisma.$transaction(async (tx) => {
    const updated = await tx.project.update({
      where: { id: projectId },
      data: { expertId, expertRole: nextRole },
    });
    await tx.projectEvent.create({
      data: {
        projectId,
        actorId: actor.id,
        kind: 'EXPERT_ASSIGNED',
        payload: { expertId },
      },
    });
    return updated;
  });

  await record(actor, {
    action: 'EXPERT_ASSIGNED',
    objectType: 'Project',
    objectId: projectId,
    projectId,
    payload: { from: ref.expertId, to: expertId },
  });

  // Эксперт узнаёт о назначении письмом. Без договора поручения — письмо
  // нейтральное: код работы и что доступ откроется после договора, без
  // названия и данных клиента (требование М-08, ОМ-13, решения Р-237,
  // Р-301).
  if (expertId !== null) {
    const assigned = await prisma.user.findUnique({
      where: { id: expertId },
      select: { expertProfile: { select: { ndaSignedAt: true } } },
    });
    const signed = (assigned?.expertProfile?.ndaSignedAt ?? null) !== null;
    await enqueue(prisma, {
      userId: expertId,
      projectId,
      eventKind: 'WORK_ASSIGNED',
      subject: `Вы назначены на работу ${project.code}`,
      body: signed
        ? `${project.code} — ${project.title}.\nМатериалы работы открыты вам в личном кабинете.`
        : `Работа ${project.code}.\nДоступ к материалам откроется после договора поручения обработки персональных данных.`,
      dedupKey: `project:${projectId}:expert-assigned:${expertId}:${Date.now()}`,
    });
  }

  // Эксперт без договора поручения материалов не увидит: руководитель
  // получает вопрос сам, а не узнаёт о нём от куратора (требование М-16,
  // ОМ-25, решение Р-298). Назначил руководитель — он и так знает.
  if (expertId !== null && actor.role === 'MANAGER') {
    const expert = await prisma.user.findUnique({
      where: { id: expertId },
      select: { fullName: true, expertProfile: { select: { ndaSignedAt: true } } },
    });
    if (expert !== null && (expert.expertProfile?.ndaSignedAt ?? null) === null) {
      const heads = await prisma.user.findMany({ where: { role: 'HEAD', status: 'ACTIVE' }, select: { id: true } });
      for (const head of heads) {
        await enqueue(prisma, {
          userId: head.id,
          projectId,
          eventKind: 'NDA_NEEDED',
          subject: `Нужен договор поручения: ${expert.fullName}, работа ${project.code}`,
          body:
            `Куратор назначил эксперта ${expert.fullName} на работу ${project.code} — ${project.title}.\n` +
            'Договора поручения обработки персональных данных с ним нет: материалы клиента ему закрыты.\n' +
            'Отметить договор можно в «Учётных записях».',
          dedupKey: `nda-needed:${projectId}:${expertId}:${head.id}`,
        });
      }
    }
  }
  return project;
}

/**
 * Сменить куратора работы.
 *
 * Куратором становится тот, кто одобрил заявку, и до сих пор изменить это
 * было нечем: работа оставалась за первым, кто до неё дошёл. Руководитель
 * передаёт её другому — клиент видит смену в ленте событий, потому что
 * меняется тот, кому он пишет.
 */
export async function assignManager(actor: Actor, projectId: string, managerId: string) {
  const ref = await projectRef(projectId);
  if (ref === null) throw new Error('Проект не найден');
  ensure(actor, 'PROJECT_SET_MANAGER', ref);

  // Куратором может быть только действующий сотрудник практики: иначе
  // работа ушла бы к клиенту или к приостановленной учётной записи.
  const target = await prisma.user.findFirst({
    where: { id: managerId, status: 'ACTIVE', role: { in: ['MANAGER', 'HEAD'] } },
    select: { id: true, fullName: true, expertProfile: { select: { degree: true, specialization: true } } },
  });
  if (target === null) throw new Error('Куратором может быть менеджер или руководитель');
  if (managerId === ref.managerId) {
    return prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  }

  const project = await prisma.$transaction(async (tx) => {
    const updated = await tx.project.update({
      where: { id: projectId },
      data: { managerId },
      include: { client: { select: { userId: true } } },
    });
    await tx.projectEvent.create({
      data: { projectId, actorId: actor.id, kind: 'MANAGER_ASSIGNED', payload: { managerId } },
    });
    // Новому куратору — письмо: работа стала его, а узнавал он об этом,
    // только открыв перечень (требование М-07, решение Р-300).
    if (managerId !== actor.id) {
      await enqueue(tx, {
        userId: managerId,
        projectId,
        eventKind: 'CURATOR_ASSIGNED',
        subject: `Вам передана работа ${updated.code}`,
        body: `${updated.code} — ${updated.title}.\nРаботу передал руководитель; она уже в вашем перечне «Работы практики».`,
        dedupKey: `project:${projectId}:curator-assigned:${managerId}:${Date.now()}`,
      });
    }
    // Клиент узнаёт, с кем теперь переписывается: куратор — его собеседник
    // (требование Т-21, решение Р-299). Регалии — по Т-11 (Р-297).
    if (updated.client.userId !== null) {
      await enqueue(tx, {
        userId: updated.client.userId,
        projectId,
        eventKind: 'CURATOR_CHANGED',
        subject: `У работы «${updated.title}» новый куратор`,
        body:
          `Проект ${updated.code} — ${updated.title}.\n` +
          `Новый куратор: ${curatorLine(target)}.\n` +
          'Писать ему можно в переписке по работе в личном кабинете.',
        dedupKey: `project:${projectId}:curator:${managerId}:${Date.now()}`,
      });
    }
    return updated;
  });

  await record(actor, {
    action: 'MANAGER_ASSIGNED',
    objectType: 'Project',
    objectId: projectId,
    projectId,
    payload: { from: ref.managerId, to: managerId },
  });
  return project;
}

export interface AddStageInput {
  readonly projectId: string;
  readonly title: string;
  /** Суть выполнения: что делается на этапе и чем он закончится. */
  readonly summary?: string | null;
  readonly dueOn?: Date | null;
  readonly expertId?: string | null;
}

/** Завести этап. Название — свободный текст менеджера, состояние — из перечня. */
export async function addStage(actor: Actor, input: AddStageInput) {
  const ref = await projectRef(input.projectId);
  if (ref === null) throw new Error('Проект не найден');
  ensure(actor, 'STAGE_EDIT', ref);
  await ensureProjectActive(ref.id);

  const title = input.title.trim();
  if (title.length === 0) throw new Error('Этап без названия не заводится');

  const stage = await prisma.$transaction(async (tx) => {
    const last = await tx.stage.findFirst({
      where: { projectId: input.projectId },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    return tx.stage.create({
      data: {
        projectId: input.projectId,
        position: (last?.position ?? 0) + 1,
        title,
        summary: input.summary?.trim() || null,
        dueOn: input.dueOn ?? null,
        expertId: input.expertId ?? null,
      },
    });
  });
  // Название этапа в журнал не пишется: журнал хранит идентификаторы, а
  // текст затирается по требованию субъекта (решения Р-234, Р-239).
  await record(actor, {
    action: 'STAGE_CREATED',
    objectType: 'Stage',
    objectId: stage.id,
    projectId: input.projectId,
    payload: { position: stage.position },
  });
  return stage;
}

/** План работ меняется только у действующей работы — общая проверка М-11. */
async function planStage(actor: Actor, stageId: string, action: 'STAGE_EDIT' | 'STAGE_SET_STATE') {
  const stage = await prisma.stage.findUnique({
    where: { id: stageId },
    select: { id: true, projectId: true, position: true, title: true, state: true, dueOn: true, completedAt: true },
  });
  if (stage === null) throw new Error('Этап не найден');
  const ref = await projectRef(stage.projectId);
  if (ref === null) throw new Error('Проект не найден');
  ensure(actor, action, ref);
  await ensureProjectActive(ref.id);
  return stage;
}

/**
 * Переставить этап выше или ниже (требование М-11, решение Р-303). Две
 * позиции меняются в одной транзакции в два шага — сначала уводятся в
 * отрицательные, затем ставятся окончательные: иначе мешает уникальный
 * ключ `[projectId, position]`. План, изменённый в другом окне, — отказ.
 */
export async function moveStage(actor: Actor, stageId: string, direction: 'up' | 'down') {
  const stage = await planStage(actor, stageId, 'STAGE_EDIT');
  const target = direction === 'up' ? stage.position - 1 : stage.position + 1;
  await prisma.$transaction(async (tx) => {
    const neighbour = await tx.stage.findFirst({
      where: { projectId: stage.projectId, position: target },
      select: { id: true },
    });
    if (neighbour === null) {
      throw new Error(direction === 'up' ? 'Этап и так первый' : 'Этап и так последний');
    }
    const first = await tx.stage.updateMany({
      where: { id: stage.id, position: stage.position },
      data: { position: -stage.position },
    });
    const second = await tx.stage.updateMany({
      where: { id: neighbour.id, position: target },
      data: { position: -target },
    });
    if (first.count === 0 || second.count === 0) throw new Error('План уже изменён: обновите страницу');
    await tx.stage.update({ where: { id: stage.id }, data: { position: target } });
    await tx.stage.update({ where: { id: neighbour.id }, data: { position: stage.position } });
    await tx.projectEvent.create({
      data: {
        projectId: stage.projectId,
        actorId: actor.id,
        kind: 'PLAN_CHANGED',
        payload: { action: 'moved', stageId: stage.id, title: stage.title, from: stage.position, to: target },
      },
    });
  });
  await record(actor, {
    action: 'PLAN_CHANGED',
    objectType: 'Stage',
    objectId: stage.id,
    projectId: stage.projectId,
    payload: { moved: { from: stage.position, to: target } },
  });
}

/**
 * Удалить этап, который не начат, без материалов (в том числе удалённых)
 * и без начислений (требование М-11, решение Р-303). Позиции следующих
 * этапов уплотняются.
 */
export async function removeStage(actor: Actor, stageId: string) {
  const stage = await planStage(actor, stageId, 'STAGE_EDIT');
  if (stage.state !== 'NOT_STARTED') throw new Error('Удалить можно только не начатый этап');
  const [materials, payouts] = await Promise.all([
    prisma.material.count({ where: { stageId } }),
    prisma.expertPayout.count({ where: { stageId } }),
  ]);
  if (materials > 0) throw new Error('У этапа есть материалы: удалить его нельзя');
  if (payouts > 0) throw new Error('По этапу есть начисления эксперту: удалить его нельзя');
  await prisma.$transaction(async (tx) => {
    const removed = await tx.stage.deleteMany({ where: { id: stageId, state: 'NOT_STARTED' } });
    if (removed.count === 0) throw new Error('План уже изменён: обновите страницу');
    const later = await tx.stage.findMany({
      where: { projectId: stage.projectId, position: { gt: stage.position } },
      orderBy: { position: 'asc' },
      select: { id: true, position: true },
    });
    for (const row of later) {
      await tx.stage.update({ where: { id: row.id }, data: { position: row.position - 1 } });
    }
    await tx.projectEvent.create({
      data: {
        projectId: stage.projectId,
        actorId: actor.id,
        kind: 'PLAN_CHANGED',
        payload: { action: 'removed', title: stage.title, position: stage.position },
      },
    });
  });
  await record(actor, {
    action: 'PLAN_CHANGED',
    objectType: 'Stage',
    objectId: stageId,
    projectId: stage.projectId,
    payload: { removed: stage.position },
  });
}

/**
 * Завести план по шаблону типа сопровождения прямо на карточке, пока
 * этапов нет (требование М-11, решение Р-303). Прежде шаблон применялся
 * только при одобрении заявки.
 */
export async function applyStageTemplate(actor: Actor, projectId: string) {
  const ref = await projectRef(projectId);
  if (ref === null) throw new Error('Проект не найден');
  ensure(actor, 'STAGE_EDIT', ref);
  await ensureProjectActive(ref.id);
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { serviceTypeId: true } });
  const template = await prisma.stageTemplate.findMany({
    where: { serviceTypeId: project.serviceTypeId, isActive: true },
    orderBy: { position: 'asc' },
  });
  if (template.length === 0) throw new Error('У типа сопровождения нет шаблона этапов');
  await prisma.$transaction(async (tx) => {
    const existing = await tx.stage.count({ where: { projectId } });
    if (existing > 0) throw new Error('План уже заведён: шаблон применяется только к пустому плану');
    await tx.stage.createMany({ data: templateStages(projectId, template, now()) });
    await tx.projectEvent.create({
      data: { projectId, actorId: actor.id, kind: 'PLAN_CHANGED', payload: { action: 'template', count: template.length } },
    });
  });
  await record(actor, {
    action: 'PLAN_CHANGED',
    objectType: 'Project',
    objectId: projectId,
    projectId,
    payload: { template: template.length },
  });
}

/** Сколько этапов в шаблоне типа работы — для кнопки на карточке (Р-303). */
export async function templateLength(actor: Actor, projectId: string): Promise<number> {
  const ref = await projectRef(projectId);
  if (ref === null || !can(actor, 'STAGE_EDIT', ref)) return 0;
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { serviceTypeId: true } });
  return prisma.stageTemplate.count({ where: { serviceTypeId: project.serviceTypeId, isActive: true } });
}

/** Акты и оплаченные транши работы — предупреждение перед возвратом этапа (ОМ-21). */
export async function stagePaperwork(actor: Actor, projectId: string): Promise<{ acts: number; paid: number }> {
  const ref = await projectRef(projectId);
  if (ref === null) return { acts: 0, paid: 0 };
  ensure(actor, 'STAGE_SET_STATE', ref);
  const [acts, paid] = await Promise.all([
    prisma.material.count({ where: { projectId, kind: 'ACT', deletedAt: null } }),
    prisma.tranche.count({ where: { contract: { projectId }, status: 'PAID' } }),
  ]);
  return { acts, paid };
}

/**
 * Вернуть завершённый этап в работу — с причиной (требование М-11,
 * решение Р-303). Приёмку этапа, в том числе по п. 7.3 оферты, возврат не
 * отменяет: история хранит обе записи, а при новой сдаче срок согласования
 * идёт заново. Клиенту и руководителю — письма.
 */
export async function reopenStage(
  actor: Actor,
  input: { readonly stageId: string; readonly reason: string; readonly dueOn?: Date | null },
) {
  const stage = await planStage(actor, input.stageId, 'STAGE_SET_STATE');
  if (stage.state !== 'DONE') throw new Error('Вернуть в работу можно только завершённый этап');
  const why = input.reason.trim();
  if (why === '') throw new Error('Вернуть этап в работу можно только с причиной: её получит клиент');
  if (why.length > 2000) throw new Error('Причина — не длиннее 2000 знаков');

  await prisma.$transaction(async (tx) => {
    const claimed = await tx.stage.updateMany({
      where: { id: stage.id, state: 'DONE' },
      data: {
        state: 'IN_PROGRESS',
        completedAt: null,
        approvalSentAt: null,
        approvalDueOn: null,
        approvalDaysLeft: null,
        ...(input.dueOn == null ? {} : { dueOn: input.dueOn }),
      },
    });
    if (claimed.count === 0) throw new Error('Этап уже переведён другим действием: обновите страницу');
    await tx.stageStateChange.create({
      data: { stageId: stage.id, fromState: 'DONE', toState: 'IN_PROGRESS', actorId: actor.id, reason: why },
    });
    await tx.projectEvent.create({
      data: {
        projectId: stage.projectId,
        actorId: actor.id,
        kind: 'STAGE_STATE_CHANGED',
        payload: { stageId: stage.id, position: stage.position, from: 'DONE', to: 'IN_PROGRESS', reason: why },
      },
    });
    const project = await tx.project.findUniqueOrThrow({
      where: { id: stage.projectId },
      select: { code: true, title: true, client: { select: { userId: true } } },
    });
    const body =
      `Проект ${project.code} — ${project.title}.\n` +
      `Этап «${stage.title}» снова в работе.\nПричина: ${why}\n${stageLink(stage.id)}`;
    if (project.client.userId !== null) {
      await enqueue(tx, {
        userId: project.client.userId,
        projectId: stage.projectId,
        eventKind: 'STAGE_REOPENED',
        subject: `Этап «${stage.title}» возвращён в работу`,
        body,
        dedupKey: `stage:${stage.id}:reopened:${Date.now()}`,
      });
    }
    const heads = await tx.user.findMany({
      where: { role: 'HEAD', status: 'ACTIVE', id: { not: actor.id } },
      select: { id: true },
    });
    for (const head of heads) {
      await enqueue(tx, {
        userId: head.id,
        projectId: stage.projectId,
        eventKind: 'STAGE_REOPENED',
        subject: `Этап «${stage.title}» возвращён в работу: ${project.code}`,
        body,
        dedupKey: `stage:${stage.id}:reopened:${head.id}:${Date.now()}`,
      });
    }
  });
  await record(actor, {
    action: 'STAGE_REOPENED',
    objectType: 'Stage',
    objectId: stage.id,
    projectId: stage.projectId,
    payload: { from: 'DONE', to: 'IN_PROGRESS', ...dueChange(stage.dueOn, input.dueOn ?? stage.dueOn) },
  });
}

/**
 * Правка этапа менеджером: название, суть выполнения, срок.
 *
 * План работ заводит и ведёт менеджер — заказчик потребовал, чтобы он мог
 * не только добавить этап, но и описать, что на нём делается, и поправить
 * срок, не заходя на отдельный экран (решение Р-190). Состояние правится
 * своим действием: у него закрытый перечень переходов.
 */
export async function editStage(
  actor: Actor,
  input: {
    readonly stageId: string;
    readonly title: string;
    readonly summary?: string | null;
    readonly dueOn?: Date | null;
    /** Причина переноса срока: обязательна, если срок меняется (М-15). */
    readonly reason?: string | null;
  },
) {
  const stage = await prisma.stage.findUnique({
    where: { id: input.stageId },
    select: { id: true, projectId: true, title: true, dueOn: true },
  });
  if (stage === null) throw new Error('Этап не найден');
  const ref = await projectRef(stage.projectId);
  if (ref === null) throw new Error('Проект не найден');
  ensure(actor, 'STAGE_EDIT', ref);
  await ensureProjectActive(ref.id);

  const title = input.title.trim();
  if (title.length === 0) throw new Error('Этап без названия не заводится');
  const nextDue = input.dueOn ?? null;
  const moved = dueKey(stage.dueOn) !== dueKey(nextDue);
  const why = (input.reason ?? '').trim();
  if (moved) ensureDueReason(why);

  const saved = await prisma.$transaction(async (tx) => {
    const updated = await tx.stage.update({
      where: { id: stage.id },
      data: { title, summary: input.summary?.trim() || null, dueOn: nextDue },
    });
    if (moved) await announceDueChange(tx, actor, stage.id, stage.dueOn, nextDue, why);
    return updated;
  });
  await record(actor, {
    action: 'STAGE_EDITED',
    objectType: 'Stage',
    objectId: stage.id,
    projectId: stage.projectId,
    // Перенос срока — то, о чём потом спрашивают: кто и когда сдвинул.
    // Прежде журнал помнил только название (решение Р-240).
    payload: {
      from: stage.title,
      to: title,
      ...dueChange(stage.dueOn, saved.dueOn),
    },
  });
  return saved;
}

/** День срока строкой — для сравнения и записи в историю. */
function dueKey(value: Date | null): string | null {
  return value?.toISOString().slice(0, 10) ?? null;
}

/** Причина переноса срока: её читает клиент (требование М-15, Р-302). */
function ensureDueReason(reason: string): void {
  if (reason === '') {
    throw new Error('Срок этапа переносится с причиной: её получит клиент — без неё перенос читается как срыв');
  }
  if (reason.length > 1000) throw new Error('Причина переноса — не длиннее 1000 знаков');
}

/**
 * Перенос срока этапа: событие в историю работы и письма (требование
 * М-15, решение Р-302). Клиенту — если срок был и сменился, с причиной;
 * эксперту — если этап в работе (ОМ-19). Причина хранится в данных
 * события и затирается обезличиванием (Р-234).
 */
async function announceDueChange(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  actor: Actor,
  stageId: string,
  from: Date | null,
  to: Date | null,
  reason: string,
): Promise<void> {
  const stage = await tx.stage.findUniqueOrThrow({
    where: { id: stageId },
    select: {
      title: true,
      state: true,
      project: {
        select: {
          id: true,
          code: true,
          title: true,
          client: { select: { userId: true } },
          expert: { select: { id: true, status: true, expertProfile: { select: { ndaSignedAt: true } } } },
        },
      },
    },
  });
  const project = stage.project;
  await tx.projectEvent.create({
    data: {
      projectId: project.id,
      actorId: actor.id,
      kind: 'STAGE_DUE_CHANGED',
      payload: { stageId, dueFrom: dueKey(from), dueTo: dueKey(to), reason },
    },
  });
  const line = to === null ? 'Срок этапа снят.' : `Новый срок — ${formatDay(to)}.`;
  if (from !== null && project.client.userId !== null) {
    await enqueue(tx, {
      userId: project.client.userId,
      projectId: project.id,
      eventKind: 'STAGE_DUE_CHANGED',
      subject: `Срок этапа «${stage.title}» изменён`,
      body: `Проект ${project.code} — ${project.title}.\n${line}\nПричина: ${reason}\n${stageLink(stageId)}`,
      dedupKey: `stage:${stageId}:due-changed:${dueKey(to) ?? 'none'}:${Date.now()}`,
    });
  }
  const expert = project.expert;
  if (
    stage.state === 'IN_PROGRESS' &&
    expert !== null &&
    expert.status === 'ACTIVE' &&
    (expert.expertProfile?.ndaSignedAt ?? null) !== null
  ) {
    await enqueue(tx, {
      userId: expert.id,
      projectId: project.id,
      eventKind: 'STAGE_DUE_CHANGED',
      subject: `Срок этапа «${stage.title}» изменён`,
      body: `Работа ${project.code}.\n${line}\nПричина: ${reason}\n${stageLink(stageId)}`,
      dedupKey: `stage:${stageId}:due-changed-expert:${dueKey(to) ?? 'none'}:${Date.now()}`,
    });
  }
}

/**
 * Перенести срок этапа с экрана этапа: меняется только срок, с причиной
 * (требование М-15, решение Р-302). Прежде форма слала скрытые название
 * и суть этапа, и правка, сделанная в другом окне, откатывалась.
 */
export async function rescheduleStage(
  actor: Actor,
  input: { readonly stageId: string; readonly dueOn: Date | null; readonly reason: string },
) {
  const stage = await prisma.stage.findUnique({
    where: { id: input.stageId },
    select: { id: true, projectId: true, dueOn: true },
  });
  if (stage === null) throw new Error('Этап не найден');
  const ref = await projectRef(stage.projectId);
  if (ref === null) throw new Error('Проект не найден');
  ensure(actor, 'STAGE_EDIT', ref);
  await ensureProjectActive(ref.id);
  if (input.dueOn === null) throw new Error('Укажите новый срок этапа');
  if (dueKey(stage.dueOn) === dueKey(input.dueOn)) throw new Error('Новый срок совпадает с прежним');
  const why = input.reason.trim();
  ensureDueReason(why);

  const saved = await prisma.$transaction(async (tx) => {
    const claimed = await tx.stage.updateMany({
      where: { id: stage.id, dueOn: stage.dueOn },
      data: { dueOn: input.dueOn },
    });
    if (claimed.count === 0) throw new Error('Срок этапа уже изменён другим действием: обновите страницу');
    await announceDueChange(tx, actor, stage.id, stage.dueOn, input.dueOn, why);
    return tx.stage.findUniqueOrThrow({ where: { id: stage.id } });
  });
  // В журнал — даты без текста причины (решения Р-234, Р-239).
  await record(actor, {
    action: 'STAGE_EDITED',
    objectType: 'Stage',
    objectId: stage.id,
    projectId: stage.projectId,
    payload: dueChange(stage.dueOn, saved.dueOn),
  });
  return saved;
}

/**
 * Правка карточки работы менеджером: название, тема, короткое описание,
 * срок. Прежде карточка заполнялась один раз при одобрении заявки и
 * больше не менялась ничем (решение Р-190).
 */
export async function editProject(
  actor: Actor,
  input: {
    readonly projectId: string;
    readonly title: string;
    readonly topic?: string | null;
    readonly summary?: string | null;
    readonly dueOn?: Date | null;
    /** Срок согласования этапа, рабочих дней; не передан — не меняется. */
    readonly approvalDays?: number;
  },
) {
  const ref = await projectRef(input.projectId);
  if (ref === null) throw new Error('Проект не найден');
  ensure(actor, 'PROJECT_EDIT', ref);

  const title = input.title.trim();
  if (title.length === 0) throw new Error('Работа без названия не заводится');
  // Пределы — по образцу Р-242: без них длинный текст молча ложился в базу,
  // а отказ формы не мог вернуть его в поле (решение Р-279).
  if (title.length > 300) throw new Error('Название работы — не длиннее 300 знаков');
  if ((input.topic ?? '').trim().length > 500) throw new Error('Тема — не длиннее 500 знаков');
  if ((input.summary ?? '').trim().length > 2000) {
    throw new Error('Короткое описание задачи — не длиннее 2000 знаков');
  }
  // Меньше пяти рабочих дней не принимается — п. 7.2 оферты; новое число
  // действует со следующей сдачи этапа (Т-15, решение Р-290).
  if (
    input.approvalDays !== undefined &&
    (!Number.isInteger(input.approvalDays) ||
      input.approvalDays < APPROVAL_DAYS_MIN ||
      input.approvalDays > APPROVAL_DAYS_MAX)
  ) {
    throw new Error(
      `Срок согласования — от ${APPROVAL_DAYS_MIN} до ${APPROVAL_DAYS_MAX} рабочих дней: меньше пяти не допускает п. 7.2 оферты`,
    );
  }

  const before = await prisma.project.findUniqueOrThrow({
    where: { id: input.projectId },
    select: { dueOn: true, approvalDays: true, status: true },
  });
  // Карточка закрытой работы не правится (М-10, решение Р-293).
  ensureWorkOpen(before.status);
  const saved = await prisma.project.update({
    where: { id: input.projectId },
    data: {
      title,
      topic: input.topic?.trim() || null,
      summary: input.summary?.trim() || null,
      dueOn: input.dueOn ?? null,
      ...(input.approvalDays === undefined ? {} : { approvalDays: input.approvalDays }),
    },
  });
  await record(actor, {
    action: 'PROJECT_EDITED',
    objectType: 'Project',
    objectId: input.projectId,
    projectId: input.projectId,
    payload: {
      title,
      ...dueChange(before.dueOn, saved.dueOn),
      ...(before.approvalDays === saved.approvalDays
        ? {}
        : { approvalDaysFrom: before.approvalDays, approvalDaysTo: saved.approvalDays }),
    },
  });
  return saved;
}

/** Письмо клиенту о смене состояния работы (требование Т-21, решение Р-299). */
const STATUS_LETTER: Record<ProjectStatusKey, (title: string, reason: string) => { subject: string; body: string }> = {
  PAUSED: (title, reason) => ({ subject: `Работа «${title}» приостановлена`, body: `Причина: ${reason}` }),
  COMPLETED: (title) => ({
    subject: `Работа «${title}» завершена`,
    body: 'Материалы остаются доступны в кабинете.',
  }),
  CANCELLED: (title, reason) => ({ subject: `Работа «${title}» отменена`, body: `Причина: ${reason}` }),
  ACTIVE: (title) => ({ subject: `Работа «${title}» возобновлена`, body: 'Работа снова идёт.' }),
};

/**
 * Сменить состояние работы: приостановить, завершить, отменить, вернуть в
 * действие (решение Р-223).
 *
 * Прежде состояние и дату закрытия писал только перенос книги заказов:
 * работу, заведённую в кабинете, закрыть было нельзя, хотя сводка
 * советовала «закрыть работу». Она оставалась действующей навсегда — не
 * попадала в «Завершённые», в отчёт о закрытых за период и в сроки
 * выполнения аналитики, а после срока висела в «Требует внимания».
 */
export async function setProjectStatus(
  actor: Actor,
  projectId: string,
  to: ProjectStatusKey,
  reason?: string | null,
) {
  const ref = await projectRef(projectId);
  if (ref === null) throw new Error('Проект не найден');
  ensure(actor, 'PROJECT_EDIT', ref);
  if (!Object.hasOwn(PROJECT_STATUS_LABEL, to)) throw new Error('Неизвестное состояние работы');

  const current = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    select: { status: true },
  });
  const from = current.status as ProjectStatusKey;
  if (!canChangeProjectStatus(from, to)) {
    throw new Error(
      `Из состояния «${PROJECT_STATUS_LABEL[from]}» в «${PROJECT_STATUS_LABEL[to]}» работа не переводится`,
    );
  }
  // Приостановка и отмена — с причиной для клиента: без неё он узнавал о
  // них, только открыв кабинет (требования Т-21, М-09, решение Р-299).
  const why = (reason ?? '').trim();
  if ((to === 'PAUSED' || to === 'CANCELLED') && why === '') {
    throw new Error('Приостановить или отменить работу можно только с причиной: её получит клиент');
  }
  if (why.length > 2000) throw new Error('Причина — не длиннее 2000 знаков');

  // Дата закрытия — день, а не мгновение: так её пишет и перенос книги.
  // День московский: по UTC работа, закрытая до трёх часов ночи, получала
  // вчерашнюю дату (решение Р-257).
  const closedOn = isClosedStatus(to) ? moscowToday() : null;

  const saved = await prisma.$transaction(async (tx) => {
    // Перевод захватывает работу по прежнему состоянию, как транш и этап.
    // Прежде «Завершить» и «Отменить», пришедшие почти одновременно,
    // проходили оба: проверка перехода стояла на прочитанном до записи, и
    // вторая запись переводила работу из состояния, которого уже не было,
    // а в ленте оставались два перехода из одного «Действует» (решение
    // Р-251).
    const claimed = await tx.project.updateMany({
      where: { id: projectId, status: from },
      data: { status: to, closedOn },
    });
    if (claimed.count === 0) {
      throw new Error('Состояние работы уже изменено другим действием: обновите страницу');
    }
    // Срок согласования стоит, пока работа не в действии: остаток рабочих
    // дней сохраняется, а при возобновлении срок отсчитывается заново от
    // дня возобновления (требование Т-15, решение Р-290).
    if (from === 'ACTIVE' && to !== 'ACTIVE') await holdApprovalDeadlines(tx, projectId, new Date());
    if (from !== 'ACTIVE' && to === 'ACTIVE') await resumeApprovalDeadlines(tx, projectId, new Date());
    // Причина — в данных события: история работы называет её, а
    // обезличивание затирает данные событий целиком (Р-234).
    await tx.projectEvent.create({
      data: {
        projectId,
        actorId: actor.id,
        kind: 'PROJECT_STATUS_CHANGED',
        payload: { from, to, ...(why === '' ? {} : { reason: why }) },
      },
    });
    const saved = await tx.project.findUniqueOrThrow({
      where: { id: projectId },
      include: { client: { select: { userId: true } } },
    });
    // Клиенту — письмо в той же транзакции; в мессенджер уходит только
    // сигнал без причины (Р-187).
    if (saved.client.userId !== null) {
      const letter = STATUS_LETTER[to](saved.title, why);
      await enqueue(tx, {
        userId: saved.client.userId,
        projectId,
        eventKind: 'PROJECT_STATUS_CHANGED',
        subject: letter.subject,
        body: `Проект ${saved.code} — ${saved.title}.\n${letter.body}\nОткрыть работу можно в личном кабинете.`,
        dedupKey: `project:${projectId}:status:${from}-${to}:${Date.now()}`,
      });
    }
    return saved;
  });

  await record(actor, {
    action: 'PROJECT_STATUS_CHANGED',
    objectType: 'Project',
    objectId: projectId,
    projectId,
    payload: { from, to },
  });
  return saved;
}

export type StageState =
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'AWAITING_CLIENT'
  | 'IN_APPROVAL'
  | 'DONE';

export function canTransition(from: StageState, to: StageState): boolean {
  return STAGE_TRANSITIONS[from].includes(to);
}

const INACTIVE_PROJECT =
  'Работа не в действии: этапы приостановленной, завершённой или отменённой работы не меняются';

/**
 * Этапы меняются только у действующей работы.
 *
 * Прежде закрытие работы этапов не касалось: этап отменённой работы можно
 * было перевести, клиенту уходило «ждём ваших материалов», а сводка
 * куратора держала его в «Требует внимания» бессрочно (решение Р-240).
 * Вернуть работу в действие — отдельное действие с записью в ленте.
 */
async function ensureProjectActive(projectId: string): Promise<void> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { status: true },
  });
  if (project === null) throw new Error('Проект не найден');
  if (project.status !== 'ACTIVE') throw new Error(INACTIVE_PROJECT);
}

/** Полночь UTC того же дня: сроки в кабинете — дни, а не мгновения. */
function dayOf(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
}

/**
 * Этапы из шаблона со сроками подряд.
 *
 * Длительность в справочнике — длительность этапа, и срок каждого
 * отсчитывается от срока предыдущего. Прежде все сроки отсчитывались от
 * одного «сейчас»: этапы в 10, 20 и 15 дней получали сроки на 10-й, 20-й и
 * 15-й день — третий раньше второго, — да ещё с часами и минутами момента
 * одобрения, из-за чего срок «сегодня» выглядел сорванным с утра (решение
 * Р-240). Этап без длительности срока не получает и отсчёт не сдвигает.
 */
export function templateStages(
  projectId: string,
  template: readonly { readonly title: string; readonly durationDays: number | null }[],
  at: Date,
) {
  let cursor = dayOf(at).getTime();
  return template.map((item, index) => {
    let dueOn: Date | null = null;
    if (item.durationDays !== null) {
      cursor += item.durationDays * 86_400_000;
      dueOn = new Date(cursor);
    }
    return { projectId, position: index + 1, title: item.title, dueOn };
  });
}

/** Перенос срока для журнала: пусто, если срок не менялся. */
function dueChange(from: Date | null, to: Date | null) {
  const a = from?.toISOString().slice(0, 10) ?? null;
  const b = to?.toISOString().slice(0, 10) ?? null;
  return a === b ? {} : { dueFrom: a ?? 'без срока', dueTo: b ?? 'без срока' };
}

/** Предел основания согласования за клиента (Р-292). */
const BASIS_LIMIT = 500;

/** Пометка согласования в сессии, открытой ссылкой сотрудника (ОМ-3). */
export const STAFF_LINK_NOTE = 'Согласовано во входе по ссылке, которую выдал сотрудник';

/** Предел итога этапа: письмо и карточка согласования, а не отчёт. */
export const OUTCOME_LIMIT = 2000;

/**
 * Правка итога этапа на согласовании: куратор уточняет текст, не снимая
 * этап с согласования (требование Т-14, решение Р-289). Только у
 * действующей работы — как и любой перевод этапа.
 */
export async function editStageOutcome(actor: Actor, stageId: string, text: string) {
  const stage = await prisma.stage.findUnique({
    where: { id: stageId },
    include: {
      project: {
        select: { id: true, clientId: true, managerId: true, expertId: true, status: true },
      },
    },
  });
  if (stage === null) throw new Error('Этап не найден');
  ensure(actor, 'STAGE_SET_STATE', stage.project);
  if (stage.project.status !== 'ACTIVE') throw new Error(INACTIVE_PROJECT);
  const outcome = text.trim();
  if (outcome === '') throw new Error('Итог этапа не может быть пустым: клиент решает о согласовании по нему');
  if (outcome.length > OUTCOME_LIMIT) {
    throw new Error(`Итог этапа длиннее ${OUTCOME_LIMIT} знаков: сократите его`);
  }
  const saved = await prisma.stage.updateMany({
    where: { id: stageId, state: 'IN_APPROVAL' },
    data: { outcome },
  });
  if (saved.count === 0) throw new Error('Этап уже не на согласовании: обновите страницу');
}

export async function setStageState(
  actor: Actor,
  stageId: string,
  to: StageState,
  reason?: string | null,
) {
  const stage = await prisma.stage.findUnique({
    where: { id: stageId },
    include: {
      project: {
        select: {
          id: true,
          clientId: true,
          managerId: true,
          expertId: true,
          status: true,
          approvalDays: true,
          client: { select: { userId: true } },
        },
      },
    },
  });
  if (stage === null) throw new Error('Этап не найден');

  // Согласование этапа — действие клиента, остальные переходы ведёт менеджер.
  const action = stage.state === 'IN_APPROVAL' && to === 'DONE' ? 'STAGE_APPROVE' : 'STAGE_SET_STATE';
  ensure(actor, action, stage.project);
  if (stage.project.status !== 'ACTIVE') throw new Error(INACTIVE_PROJECT);
  // Клиент после срока при включённом автозакрытии: этап принят по п. 7.3
  // оферты (Т-15, решение Р-290).
  if (action === 'STAGE_APPROVE' && actor.role === 'CLIENT') ensureApprovalOpen(stage.approvalDueOn);
  // Практика согласует за клиента только с основанием: согласование
  // закрывает этап по оферте, и клиент видит, на каком основании это
  // сделано от его имени (требование М-12, О-6, решение Р-292).
  const forClient = action === 'STAGE_APPROVE' && actor.role !== 'CLIENT';
  if (forClient && (reason ?? '').trim() === '') {
    throw new Error(
      'Согласовать за клиента можно только с основанием: укажите, как клиент подтвердил согласие',
    );
  }
  if (forClient && (reason ?? '').trim().length > BASIS_LIMIT) {
    throw new Error(`Основание — не длиннее ${BASIS_LIMIT} знаков`);
  }
  const via =
    action !== 'STAGE_APPROVE' ? 'MANUAL' : forClient ? 'STAFF_FOR_CLIENT' : 'CLIENT_APPROVE';

  const from = stage.state as StageState;
  // Завершённый этап возвращается в работу своим действием с причиной
  // (требование М-11, решение Р-303).
  if (from === 'DONE') {
    throw new Error('Завершённый этап возвращается в работу отдельным действием — с причиной');
  }
  if (!canTransition(from, to)) {
    // Подписи, а не имена состояний из базы: «IN_PROGRESS» человеку ничего
    // не говорит (решение Р-279).
    const staff = actor.role !== 'CLIENT';
    throw new Error(
      `Переход этапа из «${stageLabel(from, staff)}» в «${stageLabel(to, staff)}» не предусмотрен`,
    );
  }
  if (to === 'AWAITING_CLIENT' && !(reason ?? '').trim()) {
    throw new Error(
      'Остановка этапа без причины не принимается: причину читает клиент, ' +
        'и от неё зависит, что и когда он пришлёт',
    );
  }
  // Без итога клиент получал письмо «посмотрите материалы» и решал о
  // приёмке, не зная, что сделано и что будет дальше (требование Т-14,
  // решение Р-289).
  const outcome = (reason ?? '').trim();
  if (to === 'IN_APPROVAL' && outcome === '') {
    throw new Error(
      'На согласование этап уходит с итогом: напишите, что сделано и что дальше — ' +
        'клиент решает о согласовании по нему',
    );
  }
  if (to === 'IN_APPROVAL' && outcome.length > OUTCOME_LIMIT) {
    throw new Error(`Итог этапа длиннее ${OUTCOME_LIMIT} знаков: сократите его`);
  }
  // На согласование уходит только этап, к которому приложен материал:
  // клиент получает письмо «посмотрите материалы и подтвердите», и пустой
  // этап оставлял его без предмета согласования (решение Р-254).
  if (to === 'IN_APPROVAL') {
    // Материал — тот, что видит клиент: версия эксперта до публикации не
    // в счёт (требование Т-18, решение Р-294).
    const materials = await prisma.material.count({
      where: {
        stageId,
        kind: 'STAGE_MATERIAL',
        deletedAt: null,
        versions: { some: { purgedAt: null, ...CLIENT_VISIBLE_VERSION } },
      },
    });
    if (materials === 0) {
      throw new Error(
        'На согласование этап уходит с материалом, который видит клиент: приложите файл ' +
          'или опубликуйте версию эксперта — клиенту нечего посмотреть и подтвердить',
      );
    }
  }

  const now = new Date();
  // Срок согласования ставится при сдаче, если клиент может увидеть
  // результат: без учётной записи «направления» не было, и срок пойдёт с
  // открытия входа (Т-15, решение Р-290). Снятие с согласования и возврат
  // срок гасят; у завершённого этапа он остаётся записью о сроке.
  const approvalDueOn =
    to === 'IN_APPROVAL' && stage.project.client.userId !== null
      ? approvalDeadline(now, stage.project.approvalDays, await loadCalendar())
      : null;
  const approvalFields =
    to === 'IN_APPROVAL'
      ? {
          approvalSentAt: approvalDueOn === null ? null : now,
          approvalDueOn,
          approvalDaysLeft: null,
        }
      : from === 'IN_APPROVAL' && to !== 'DONE'
        ? { approvalSentAt: null, approvalDueOn: null, approvalDaysLeft: null }
        : {};
  const saved = await prisma.$transaction(async (tx) => {
    // Перевод захватывает этап по прежнему состоянию. Прежде два
    // одновременных перевода проходили проверку по прочитанному и оба
    // записывались: история этапа получала два перехода из одного
    // состояния, клиент — два письма (решение Р-240).
    const claimed = await tx.stage.updateMany({
      where: { id: stageId, state: from },
      data: {
        state: to,
        blockedReason: to === 'AWAITING_CLIENT' ? (reason ?? '').trim() : null,
        awaitingClientSince: to === 'AWAITING_CLIENT' ? now : null,
        startedAt: from === 'NOT_STARTED' && to === 'IN_PROGRESS' ? now : stage.startedAt,
        completedAt: to === 'DONE' ? now : null,
        // Повторная сдача гасит пометку «возвращён с замечаниями» и дело
        // куратора: замечания отработаны (решение Р-281).
        ...(to === 'IN_APPROVAL' ? { returnedAt: null, returnAckAt: null, outcome } : {}),
        ...approvalFields,
      },
    });
    if (claimed.count === 0) {
      throw new Error('Этап уже переведён другим действием: обновите страницу');
    }
    const updated = await tx.stage.findUniqueOrThrow({ where: { id: stageId } });
    const change = await tx.stageStateChange.create({
      data: {
        stageId,
        fromState: from,
        toState: to,
        actorId: actor.id,
        // Согласование в сессии, открытой ссылкой сотрудника, — с пометкой
        // для практики (ОМ-3, решение Р-292).
        reason: via === 'CLIENT_APPROVE' && actor.viaStaffLink === true ? STAFF_LINK_NOTE : (reason ?? null),
        via,
      },
    });

    // Клиент узнаёт письмом, что этап согласован от его имени и на каком
    // основании (требование М-12, решение Р-292).
    if (forClient && stage.project.client.userId !== null) {
      const project = await tx.project.findUnique({
        where: { id: stage.projectId },
        select: { code: true, title: true },
      });
      await enqueue(tx, {
        userId: stage.project.client.userId,
        projectId: stage.projectId,
        eventKind: 'STAGE_APPROVED',
        subject: `Этап «${stage.title}» согласован`,
        body:
          `Проект ${project?.code} — ${project?.title}.\n` +
          `Этап «${stage.title}» согласован куратором по вашему подтверждению: ${(reason ?? '').trim()}.\n` +
          'Если вы этого не подтверждали, напишите куратору в кабинете.\n' +
          stageLink(stageId),
        dedupKey: `stage:${stageId}:approved-for-client:${change.id}`,
      });
    }

    // Куратор узнаёт о приёмке этапа письмом: следующий этап и оплата
    // зависят от неё (требование Т-16, решение Р-282).
    if (action === 'STAGE_APPROVE') {
      await notifyCurator(tx, {
        projectId: stage.projectId,
        actorId: actor.id,
        eventKind: 'STAGE_APPROVED',
        subject: `Этап «${stage.title}» согласован`,
        body:
          `${actor.role === 'CLIENT' ? 'Клиент согласовал этап' : 'Этап согласован за клиента'} «${stage.title}».\n` +
          'Можно запускать следующий этап.\n' +
          stageLink(stageId),
        key: `stage:${stageId}:approved:${change.id}`,
      });
    }
    await tx.projectEvent.create({
      data: {
        projectId: stage.projectId,
        actorId: actor.id,
        kind: 'STAGE_STATE_CHANGED',
        // Причина — в данных события: история работы называет её рядом с
        // переходом (требование М-17, решение Р-288). Обезличивание
        // затирает данные событий целиком (Р-234).
        // Итог сдачи в историю работы не идёт: он длинный и стоит в
        // карточке согласования и в истории этапа (решение Р-289).
        payload: {
          stageId,
          // Номер этапа — на момент события: перестановка не перенумеровывает
          // прежние строки истории (требование М-11, решение Р-303).
          position: stage.position,
          from,
          to,
          ...((reason ?? '').trim() === '' || to === 'IN_APPROVAL' ? {} : { reason: (reason ?? '').trim() }),
          // Кто согласовал: история различает «согласован вами» и
          // «согласован куратором по вашему подтверждению» (О-6, Р-292).
          ...(via === 'MANUAL' ? {} : { via }),
        },
      },
    });

    // Уведомление ставится здесь же, в одной транзакции с переводом этапа:
    // недоступная почта не должна откатывать работу, а потерянное
    // уведомление оставило бы клиента в неведении, что от него ждут файл.
    if (to === 'AWAITING_CLIENT' || to === 'IN_APPROVAL') {
      const project = await tx.project.findUnique({
        where: { id: stage.projectId },
        select: { code: true, title: true, client: { select: { userId: true } } },
      });
      const userId = project?.client.userId ?? null;
      if (userId !== null) {
        const awaiting = to === 'AWAITING_CLIENT';
        await enqueue(tx, {
          userId,
          projectId: stage.projectId,
          eventKind: awaiting ? 'STAGE_AWAITING_CLIENT' : 'STAGE_IN_APPROVAL',
          subject: awaiting
            ? `Этап «${stage.title}» ждёт ваших материалов`
            : `Этап «${stage.title}» готов к согласованию`,
          body:
            `Проект ${project?.code} — ${project?.title}.\n` +
            (awaiting
              ? `${(reason ?? '').trim()}\n`
              : `Итог этапа: что сделано и что дальше.\n${outcome}\n\n` +
                'Посмотрите последнюю версию материалов и согласуйте этап или верните его с замечаниями' +
                (approvalDueOn === null
                  ? '.\n'
                  : ` до ${formatDay(approvalDueOn)} включительно (по московскому времени).\n`)) +
            'Открыть этап можно в личном кабинете.',
          dedupKey: `stage:${stageId}:${to.toLowerCase()}:${now.toISOString().slice(0, 16)}`,
        });
      }
    }

    return updated;
  });

  // Журнал действий: экран журнала предлагал отбор «Изменено состояние
  // этапа» и «Этап согласован», а записей таких не было — согласование
  // клиентом нигде, кроме истории этапа, не оставляло следа (решение
  // Р-239). Причина остановки в журнал не пишется: её текст лежит в
  // истории этапа и затирается вместе с ней.
  await record(actor, {
    action: action === 'STAGE_APPROVE' ? 'STAGE_APPROVED' : 'STAGE_STATE_CHANGED',
    objectType: 'Stage',
    objectId: stageId,
    projectId: stage.projectId,
    payload: {
      from,
      to,
      ...(via === 'MANUAL' ? {} : { via }),
      ...(via === 'CLIENT_APPROVE' && actor.viaStaffLink === true ? { staffLink: true } : {}),
    },
  });
  return saved;
}

/**
 * Куратор принял замечания клиента в работу: дело «Клиент вернул этап»
 * уходит с «Требует внимания» (требование М-04, решение Р-283). Пометка
 * «возвращён с замечаниями» на этапе остаётся до новой сдачи.
 */
export async function acknowledgeReturn(actor: Actor, stageId: string) {
  const stage = await prisma.stage.findUnique({
    where: { id: stageId },
    include: {
      project: {
        select: { id: true, clientId: true, managerId: true, expertId: true, status: true },
      },
    },
  });
  if (stage === null) throw new Error('Этап не найден');
  ensure(actor, 'STAGE_SET_STATE', stage.project);
  if (stage.project.status !== 'ACTIVE') throw new Error(INACTIVE_PROJECT);
  if (stage.returnedAt === null) throw new Error('Этап не возвращался клиентом');
  const marked = await prisma.stage.updateMany({
    where: { id: stageId, returnedAt: { not: null }, returnAckAt: null },
    data: { returnAckAt: new Date() },
  });
  if (marked.count === 0) return;
  await record(actor, {
    action: 'STAGE_RETURN_ACKNOWLEDGED',
    objectType: 'Stage',
    objectId: stageId,
    projectId: stage.projectId,
  });
}

/** Предел текста замечаний — как у сообщения в переписке. */
const RETURN_TEXT_MAX = 10_000;

/**
 * Клиент возвращает этап с замечаниями (требование Т-03, решение Р-281).
 *
 * Оферта (п. 7.2) даёт заказчику право на мотивированные замечания вместо
 * подписания акта; прежде у клиента была одна кнопка — «Согласовать», и
 * несогласие выражалось только комментарием или сообщением. Этап уходит
 * «В работу» с пометкой «возвращён с замечаниями»; текст хранится в
 * истории этапа и видим клиенту и практике, эксперту — без контактов
 * (`presentReturnText`). Текст с контактом не блокируется, как и в
 * переписке, а помечается: куратор видит его в реестре «Контакты в
 * переписке».
 *
 * Отдельная служба, а не `setStageState`: у возврата свои текст, пометка и
 * адресаты уведомлений. Новое состояние этапа не вводится — таблица
 * переходов (Р-229) уже знает «На согласовании → В работе».
 */
export async function returnStage(actor: Actor, stageId: string, text: string) {
  const stage = await prisma.stage.findUnique({
    where: { id: stageId },
    include: {
      project: {
        select: { id: true, clientId: true, managerId: true, expertId: true, status: true },
      },
    },
  });
  if (stage === null) throw new Error('Этап не найден');
  ensure(actor, 'STAGE_RETURN', stage.project);
  if (stage.project.status !== 'ACTIVE') throw new Error(INACTIVE_PROJECT);
  if (stage.state !== 'IN_APPROVAL') {
    throw new Error('Этап уже не на согласовании: обновите страницу');
  }
  // После срока при включённом автозакрытии этап принят по п. 7.3
  // оферты, и возврат опоздал (Т-15, решение Р-290).
  ensureApprovalOpen(stage.approvalDueOn);

  const body = text.trim();
  if (body.length === 0) {
    throw new Error('Без замечаний этап не возвращается: напишите, что нужно исправить или дополнить');
  }
  if (body.length > RETURN_TEXT_MAX) {
    throw new Error(`Замечания — не длиннее ${RETURN_TEXT_MAX.toLocaleString('ru-RU')} знаков`);
  }
  const contactHint = hasContacts(body);

  const now = new Date();
  const change = await prisma.$transaction(async (tx) => {
    // Захват по состоянию: возврат и согласование, нажатые одновременно,
    // не проходят оба (как в Р-240).
    const claimed = await tx.stage.updateMany({
      where: { id: stageId, state: 'IN_APPROVAL' },
      data: {
        state: 'IN_PROGRESS',
        completedAt: null,
        blockedReason: null,
        awaitingClientSince: null,
        returnedAt: now,
        returnAckAt: null,
        // Возврат гасит срок согласования; повторная сдача даст новый.
        approvalSentAt: null,
        approvalDueOn: null,
        approvalDaysLeft: null,
      },
    });
    if (claimed.count === 0) {
      throw new Error('Этап уже переведён другим действием: обновите страницу');
    }
    const created = await tx.stageStateChange.create({
      data: {
        stageId,
        fromState: 'IN_APPROVAL',
        toState: 'IN_PROGRESS',
        actorId: actor.id,
        reason: body,
        via: 'CLIENT_RETURN',
        contactHint,
      },
    });
    // Куратору — сигнал без текста замечаний: текст читается в кабинете,
    // как и сообщения переписки (решение Р-282).
    await notifyCurator(tx, {
      projectId: stage.projectId,
      actorId: actor.id,
      eventKind: 'STAGE_RETURNED',
      subject: `Клиент вернул этап «${stage.title}» с замечаниями`,
      body:
        `Клиент вернул этап «${stage.title}» с замечаниями; этап снова «В работе».\n` +
        'Текст замечаний — на экране этапа.\n' +
        stageLink(stageId),
      key: `stage:${stageId}:returned:${created.id}`,
    });

    // Текст замечаний — в данных события ленты: история работы показывает
    // его без похода в историю этапа, а обезличивание затирает данные
    // событий целиком (решение Р-234).
    await tx.projectEvent.create({
      data: {
        projectId: stage.projectId,
        actorId: actor.id,
        kind: 'STAGE_RETURNED',
        payload: { stageId, changeId: created.id, text: body, contactHint },
      },
    });
    return created;
  });

  // В журнал — без текста, как и остальные переходы этапа (решение Р-239).
  await record(actor, {
    action: 'STAGE_RETURNED',
    objectType: 'Stage',
    objectId: stageId,
    projectId: stage.projectId,
    payload: { from: 'IN_APPROVAL', to: 'IN_PROGRESS', contactHint },
  });
  return change;
}
