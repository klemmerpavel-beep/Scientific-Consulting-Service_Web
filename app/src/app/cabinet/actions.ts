'use server';

import { redirect } from 'next/navigation';

import { prisma } from '../../lib/db';
import { CONSENT_VERSION } from '../../lib/lead-schema';
import { ensure } from '../../lib/cabinet/access';
import { requestLoginLink, unbindTelegram } from '../../lib/cabinet/auth';
import { addComment, moderateComment, uploadVersion } from '../../lib/cabinet/materials';
import { sendMessage } from '../../lib/cabinet/messages';
import {
  addPayout,
  addTranche,
  markPayoutPaid,
  saveContract,
  setTrancheStatus,
} from '../../lib/cabinet/finance';
import { parseAmount, type TrancheStatus } from '../../lib/cabinet/money';
import { applyBatch, mergeClients, previewBook } from '../../lib/cabinet/import/apply';
import { ImportError } from '../../lib/cabinet/import/zip';
import { enqueue } from '../../lib/cabinet/outbox';
import { addStage, approveLead, assignExpert, declineLead, setStageState } from '../../lib/cabinet/projects';
import { currentActor, requestIp } from '../../lib/cabinet/session';

/**
 * Действия экранов кабинета. Каждое начинается с восстановления
 * действующего лица из серверной сессии и заканчивается вызовом службы,
 * которая сама спрашивает разрешение у модуля прав. Роль не приходит
 * с формы: иначе её можно было бы подменить.
 */

async function actorOrRedirect() {
  const actor = await currentActor();
  if (actor === null) redirect('/cabinet');
  return actor;
}

/**
 * Запрос ссылки входа. Ответ одинаков для любого исхода: иначе форма
 * превращается в средство проверки, кто является клиентом практики.
 */
export async function requestLink(form: FormData): Promise<void> {
  const email = String(form.get('email') ?? '');
  if (email.trim().length > 0) {
    await requestLoginLink(email, await requestIp());
  }
  // Ответ один на все исходы, и страница не знает, какой он был.
  redirect('/cabinet?sent=1');
}

export async function approveStage(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  const stageId = String(form.get('stageId') ?? '');
  await setStageState(actor, stageId, 'DONE');
  redirect(`/cabinet/stages/${stageId}`);
}

export async function changeStageState(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  const stageId = String(form.get('stageId') ?? '');
  const to = String(form.get('state') ?? '') as Parameters<typeof setStageState>[2];
  const reason = String(form.get('reason') ?? '');
  await setStageState(actor, stageId, to, reason);
  redirect(`/cabinet/stages/${stageId}`);
}

export async function commentOnVersion(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  const versionId = String(form.get('versionId') ?? '');
  const stageId = String(form.get('stageId') ?? '');
  await addComment(actor, versionId, String(form.get('body') ?? ''));
  redirect(`/cabinet/stages/${stageId}`);
}

export async function uploadMaterial(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) {
    throw new Error('Файл не выбран');
  }
  const stageId = String(form.get('stageId') ?? '');
  const projectId = String(form.get('projectId') ?? '');
  const materialId = String(form.get('materialId') ?? '');
  await uploadVersion(
    actor,
    {
      projectId,
      stageId: stageId || null,
      materialId: materialId || null,
      title: String(form.get('title') ?? '') || undefined,
      originalName: file.name,
      contentType: file.type || 'application/octet-stream',
      body: Buffer.from(await file.arrayBuffer()),
    },
    await requestIp(),
  );
  redirect(`/cabinet/stages/${stageId}`);
}

export async function moderateLead(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  ensure(actor, 'REQUEST_MODERATE');
  const leadId = String(form.get('leadId') ?? '');
  if (String(form.get('decision') ?? '') === 'decline') {
    await declineLead(actor, leadId, String(form.get('reason') ?? ''));
    redirect('/cabinet/manage');
  }
  const project = await approveLead(actor, {
    leadId,
    serviceTypeId: String(form.get('serviceTypeId') ?? ''),
    managerId: actor.id,
    title: String(form.get('title') ?? ''),
    applyStageTemplate: form.get('applyTemplate') === 'on',
  });
  redirect(`/cabinet/projects/${project.code}`);
}

export async function createStage(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  const projectId = String(form.get('projectId') ?? '');
  const code = String(form.get('code') ?? '');
  await addStage(actor, { projectId, title: String(form.get('title') ?? '') });
  redirect(`/cabinet/projects/${code}`);
}

export async function setExpert(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  const projectId = String(form.get('projectId') ?? '');
  const code = String(form.get('code') ?? '');
  const expertId = String(form.get('expertId') ?? '');
  await assignExpert(actor, projectId, expertId || null);
  redirect(`/cabinet/projects/${code}`);
}

/**
 * Публикация или отклонение комментария эксперта. До решения менеджера
 * комментарий клиенту не виден: выборка сужается в модуле прав, а не
 * условием в разметке.
 */
export async function decideOnComment(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  const commentId = String(form.get('commentId') ?? '');
  const stageId = String(form.get('stageId') ?? '');
  const decision = String(form.get('decision') ?? '') === 'publish' ? 'PUBLISHED' : 'REJECTED';
  await moderateComment(actor, commentId, decision);
  redirect(`/cabinet/stages/${stageId}`);
}

/**
 * Заявка, поданная клиентом изнутри кабинета. Пишется в ту же таблицу, что и
 * обращение с сайта: отдельной сущности «заявка» в системе нет, и очередь
 * модерации у менеджера одна.
 *
 * Публичная схема валидации при этом не используется: состав её полей
 * заморожен, на нём держится журнал согласий сайта (CONTRIBUTING.md). Здесь
 * заявитель уже известен по сессии, согласие принято при первом входе, и
 * спрашивать контакт заново незачем.
 */
export async function submitCabinetRequest(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  ensure(actor, 'REQUEST_CREATE');

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: actor.id },
    select: { email: true, fullName: true, consentVersion: true },
  });

  const topic = String(form.get('topic') ?? '').trim();
  if (topic.length === 0) throw new Error('Тема работы не указана');

  const lead = await prisma.lead.create({
    data: {
      source: 'cabinet',
      form: 'request',
      name: user.fullName,
      contactKind: 'email',
      contact: user.email,
      topic,
      need: String(form.get('need') ?? '').trim() || null,
      deadline: String(form.get('deadline') ?? '').trim() || null,
      message: String(form.get('message') ?? '').trim() || null,
      // Согласие принято при первом входе в кабинет; редакция текста
      // хранится вместе с заявкой, как и у обращений с сайта.
      consentGiven: true,
      consentVersion: user.consentVersion ?? CONSENT_VERSION,
      termsAccepted: true,
      ip: await requestIp(),
    },
  });

  // Менеджеры узнают о заявке из кабинета через очередь. Обращения с сайта
  // идут другим путём — их доставляет уже работающий `notify.ts`, и второе
  // уведомление о том же было бы дублем.
  const managers = await prisma.user.findMany({
    where: { role: { in: ['MANAGER', 'HEAD'] }, status: 'ACTIVE' },
    select: { id: true },
  });
  for (const manager of managers) {
    await enqueue(prisma, {
      userId: manager.id,
      eventKind: 'REQUEST_CREATED',
      subject: 'Новая заявка из кабинета',
      body: `${user.fullName}: ${topic}\nЗаявка ждёт в очереди модерации.`,
      dedupKey: `lead:${lead.id}:created:${manager.id}`,
    });
  }

  redirect('/cabinet/request?sent=1');
}

/** Отправка сообщения в канал «клиент — менеджер». */
export async function postMessage(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  const projectId = String(form.get('projectId') ?? '');
  const code = String(form.get('code') ?? '');
  await sendMessage(actor, projectId, String(form.get('body') ?? ''));
  redirect(`/cabinet/projects/${code}/messages`);
}

/** Каналы уведомлений. Выбор за получателем, а не за системой. */
export async function saveNotificationChannels(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  await prisma.user.update({
    where: { id: actor.id },
    data: {
      notifyEmail: form.get('notifyEmail') === 'on',
      notifyTelegram: form.get('notifyTelegram') === 'on',
    },
  });
  redirect('/cabinet/settings?saved=1');
}

export async function dropTelegram(): Promise<void> {
  const actor = await actorOrRedirect();
  await unbindTelegram(actor.id);
  redirect('/cabinet/settings?saved=1');
}

/** Дата из поля формы. Пустое значение — это отсутствие даты, а не «сегодня». */
function dateOrNull(value: FormDataEntryValue | null): Date | null {
  const raw = String(value ?? '').trim();
  if (raw.length === 0) return null;
  const date = new Date(`${raw}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function saveProjectContract(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  const projectId = String(form.get('projectId') ?? '');
  const code = String(form.get('code') ?? '');
  await saveContract(actor, {
    projectId,
    number: String(form.get('number') ?? ''),
    signedOn: dateOrNull(form.get('signedOn')),
    totalAmount: parseAmount(String(form.get('totalAmount') ?? '')),
  });
  redirect(`/cabinet/projects/${code}/payments`);
}

export async function addContractTranche(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  const code = String(form.get('code') ?? '');
  await addTranche(actor, {
    contractId: String(form.get('contractId') ?? ''),
    title: String(form.get('title') ?? ''),
    amount: parseAmount(String(form.get('amount') ?? '')),
    plannedDate: dateOrNull(form.get('plannedDate')),
  });
  redirect(`/cabinet/projects/${code}/payments`);
}

export async function changeTrancheStatus(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  const code = String(form.get('code') ?? '');
  await setTrancheStatus(
    actor,
    String(form.get('trancheId') ?? ''),
    String(form.get('status') ?? '') as TrancheStatus,
    dateOrNull(form.get('paidOn')),
  );
  redirect(`/cabinet/projects/${code}/payments`);
}

export async function accruePayout(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  const code = String(form.get('code') ?? '');
  await addPayout(actor, {
    projectId: String(form.get('projectId') ?? ''),
    amount: parseAmount(String(form.get('amount') ?? '')),
    comment: String(form.get('comment') ?? '') || null,
  });
  redirect(`/cabinet/projects/${code}/payments`);
}

export async function payPayout(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  const code = String(form.get('code') ?? '');
  const paidOn = dateOrNull(form.get('paidOn'));
  if (paidOn === null) throw new Error('Для выплаты нужна дата');
  await markPayoutPaid(actor, String(form.get('payoutId') ?? ''), paidOn);
  redirect(`/cabinet/projects/${code}/payments`);
}

/**
 * Загрузка книги заказов. Файл разбирается и записывается загрузкой, но
 * ни одного проекта не создаётся: дальше руководитель читает отчёт.
 */
export async function uploadOrderBook(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  const file = form.get('book');
  if (!(file instanceof File) || file.size === 0) {
    redirect('/cabinet/manage/import?error=empty');
  }
  const bytes = Buffer.from(await file.arrayBuffer());

  let batchId: string;
  try {
    const preview = await previewBook(actor, { fileName: file.name, bytes });
    batchId = preview.batchId;
  } catch (error) {
    // Разбор отказал по понятной причине — она и показывается, без следа стека.
    const code = error instanceof ImportError ? error.code : 'UNSUPPORTED';
    redirect(`/cabinet/manage/import?error=${code}`);
  }
  redirect(`/cabinet/manage/import/${batchId}`);
}

export async function applyOrderBook(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  const batchId = String(form.get('batchId') ?? '');
  const managerId = String(form.get('managerId') ?? '');
  const excludeRows = String(form.get('excludeRows') ?? '')
    .split(/[\s,]+/)
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0);

  await applyBatch(actor, batchId, { managerId, excludeRows });
  redirect(`/cabinet/manage/import/${batchId}?applied=1`);
}

export async function mergeClientCards(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  const batchId = String(form.get('batchId') ?? '');
  await mergeClients(
    actor,
    String(form.get('sourceId') ?? ''),
    String(form.get('targetId') ?? ''),
  );
  redirect(`/cabinet/manage/import/${batchId}?merged=1`);
}
