'use server';

import { redirect } from 'next/navigation';

import { CONSENT_VERSION } from '../../lib/lead-schema';
import { ensure } from '../../lib/cabinet/access';
import { requestLoginLink, unbindTelegram } from '../../lib/cabinet/auth';
import {
  addComment,
  moderateComment,
  uploadVersion,
  type MaterialKind,
} from '../../lib/cabinet/materials';
import { sendMessage } from '../../lib/cabinet/messages';
import {
  addPayout,
  addTranche,
  markPayoutPaid,
  saveContract,
  setTrancheStatus,
} from '../../lib/cabinet/finance';
import { saveYear } from '../../lib/cabinet/finance-years';
import { parseAmount, type TrancheStatus } from '../../lib/cabinet/money';
import {
  addAlias,
  createUser,
  removeAlias,
  removeStageTemplateItem,
  saveServiceType,
  saveStageTemplateItem,
  saveOwnChannels,
  setUserRole,
  issueAccessLink,
  setUserStatus,
  signExpertNda,
  type Role,
} from '../../lib/cabinet/admin';
import type { AccessLinkState } from '../../components/cabinet/AccessLink';
import { executeErasure, requestErasure } from '../../lib/cabinet/erasure';
import { createCabinetRequest, REQUEST_FILES_MAX } from '../../lib/cabinet/queries';
import { applyBatch, mergeClients, previewBook } from '../../lib/cabinet/import/apply';
import { ImportError } from '../../lib/cabinet/import/zip';
import { enqueue, retryFailed } from '../../lib/cabinet/outbox';
import {
  addStage,
  editProject,
  editStage,
  approveLead,
  assignExpert,
  assignManager,
  declineLead,
  setStageState,
} from '../../lib/cabinet/projects';
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
  let outcome: Awaited<ReturnType<typeof requestLoginLink>> | null = null;
  if (email.trim().length > 0) {
    outcome = await requestLoginLink(email, await requestIp());
  }
  // Ответ один на все исходы, кроме одного: ненастроенная почта — состояние
  // системы, а не человека, и от адреса оно не зависит. Молчать о нём
  // значило бы обещать письмо, которого не будет (решение Р-163).
  redirect(outcome === 'channel_off' ? '/cabinet?channel=off' : '/cabinet?sent=1');
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
  await addStage(actor, {
    projectId,
    title: String(form.get('title') ?? ''),
    summary: String(form.get('summary') ?? ''),
    dueOn: dateOrNull(form.get('dueOn')),
  });
  redirect(`/cabinet/projects/${code}`);
}

/** Правка этапа менеджером прямо в плане работ (решение Р-190). */
export async function saveStage(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  const code = String(form.get('code') ?? '');
  await editStage(actor, {
    stageId: String(form.get('stageId') ?? ''),
    title: String(form.get('title') ?? ''),
    summary: String(form.get('summary') ?? ''),
    dueOn: dateOrNull(form.get('dueOn')),
  });
  redirect(`/cabinet/projects/${code}`);
}

/** Правка карточки работы менеджером (решение Р-190). */
export async function saveProject(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  const code = String(form.get('code') ?? '');
  await editProject(actor, {
    projectId: String(form.get('projectId') ?? ''),
    title: String(form.get('title') ?? ''),
    topic: String(form.get('topic') ?? ''),
    summary: String(form.get('summary') ?? ''),
    dueOn: dateOrNull(form.get('dueOn')),
  });
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

/** Смена куратора работы. Доступна руководителю. */
export async function setManager(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  const projectId = String(form.get('projectId') ?? '');
  const code = String(form.get('code') ?? '');
  await assignManager(actor, projectId, String(form.get('managerId') ?? ''));
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

  // Файлы приходят одним полем: браузер кладёт в форму по записи на
  // каждый выбранный файл, и `getAll` собирает их все. Пустая запись
  // означает «ничего не выбрано» и отбрасывается (решение Р-191).
  const files = await Promise.all(
    form
      .getAll('files')
      .filter((entry): entry is File => entry instanceof File && entry.size > 0)
      .slice(0, REQUEST_FILES_MAX)
      .map(async (file) => ({
        originalName: file.name,
        contentType: file.type || 'application/octet-stream',
        body: Buffer.from(await file.arrayBuffer()),
      })),
  );

  await createCabinetRequest(
    actor,
    {
      topic: String(form.get('topic') ?? '').trim(),
      need: String(form.get('need') ?? '').trim() || null,
      deadline: String(form.get('deadline') ?? '').trim() || null,
      message: String(form.get('message') ?? '').trim() || null,
      applicantName: String(form.get('applicantName') ?? '').trim() || null,
      supervisorName: String(form.get('supervisorName') ?? '').trim() || null,
      organization: String(form.get('organization') ?? '').trim() || null,
      speciality: String(form.get('speciality') ?? '').trim() || null,
      phone: String(form.get('phone') ?? '').trim() || null,
      files,
      ip: await requestIp(),
    },
    CONSENT_VERSION,
  );

  redirect('/cabinet/request?sent=1');
}

/**
 * Отправка сообщения в канал «клиент — менеджер».
 *
 * Отправить можно с двух экранов: из переписки целиком и коротким блоком
 * на карточке работы. Возвращать человека надо туда, откуда он писал, —
 * поле `back` говорит куда. Значение не подставляется в адрес: иначе форма
 * стала бы способом увести пользователя на чужой узел.
 */
export async function postMessage(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  const projectId = String(form.get('projectId') ?? '');
  const code = String(form.get('code') ?? '');
  await sendMessage(actor, projectId, String(form.get('body') ?? ''));
  const back = String(form.get('back') ?? '');
  redirect(
    back === 'project'
      ? `/cabinet/projects/${code}`
      : `/cabinet/projects/${code}/messages`,
  );
}

/** Каналы уведомлений. Выбор за получателем, а не за системой. */
export async function saveNotificationChannels(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  await saveOwnChannels(actor, {
    email: form.get('notifyEmail') === 'on',
    telegram: form.get('notifyTelegram') === 'on',
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

export async function saveFinanceYear(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  const note = String(form.get('note') ?? '').trim();
  await saveYear(actor, {
    year: Number(String(form.get('year') ?? '').trim()),
    revenue: parseAmount(String(form.get('revenue') ?? '')),
    costs: parseAmount(String(form.get('costs') ?? '')),
    note: note.length === 0 ? null : note,
  });
  redirect('/cabinet/manage/finance/years');
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

/** Принять требование субъекта об удалении данных. Исполнение — отдельным действием. */
export async function openErasureRequest(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  const scope = String(form.get('scope') ?? 'PERSONAL_DATA_AND_FILES');
  await requestErasure(
    actor,
    String(form.get('clientId') ?? ''),
    scope === 'PERSONAL_DATA' ? 'PERSONAL_DATA' : 'PERSONAL_DATA_AND_FILES',
  );
  redirect('/cabinet/manage/erasure');
}

export async function executeErasureRequest(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  await executeErasure(actor, String(form.get('requestId') ?? ''));
  redirect('/cabinet/manage/erasure?done=1');
}

// ─────────────────────────── Учётные записи ─────────────────────────────────

/**
 * Завести учётную запись. Ссылку входа человек запрашивает сам: письмо,
 * отправленное без его действия, — рассылка, а не вход.
 */
export async function inviteUser(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  try {
    await createUser(actor, {
      email: String(form.get('email') ?? ''),
      fullName: String(form.get('fullName') ?? ''),
      role: String(form.get('role') ?? 'EXPERT') as Role,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Не удалось завести запись';
    redirect(`/cabinet/manage/users?error=${encodeURIComponent(reason)}`);
  }
  redirect('/cabinet/manage/users?created=1');
}

export async function changeUserRole(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  try {
    await setUserRole(actor, String(form.get('userId') ?? ''), String(form.get('role') ?? '') as Role);
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Не удалось сменить роль';
    redirect(`/cabinet/manage/users?error=${encodeURIComponent(reason)}`);
  }
  redirect('/cabinet/manage/users');
}

export async function changeUserStatus(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  const status = String(form.get('status') ?? '') === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE';
  try {
    await setUserStatus(actor, String(form.get('userId') ?? ''), status);
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Не удалось изменить состояние';
    redirect(`/cabinet/manage/users?error=${encodeURIComponent(reason)}`);
  }
  redirect('/cabinet/manage/users');
}

export async function giveAccessLink(
  _previous: AccessLinkState,
  form: FormData,
): Promise<AccessLinkState> {
  const actor = await actorOrRedirect();
  try {
    const issued = await issueAccessLink(
      actor,
      String(form.get('userId') ?? ''),
      await requestIp(),
    );
    const until = issued.expiresAt.toLocaleTimeString('ru-RU', {
      timeZone: 'Europe/Moscow',
      hour: '2-digit',
      minute: '2-digit',
    });
    return {
      link: issued.link,
      note: `Ссылка для «${issued.fullName}» действует до ${until} по Москве и срабатывает один раз.`,
      error: null,
    };
  } catch (error) {
    return {
      link: null,
      note: null,
      error: error instanceof Error ? error.message : 'Не удалось выдать ссылку',
    };
  }
}

export async function updateExpertNda(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  await signExpertNda(actor, String(form.get('userId') ?? ''), dateOrNull(form.get('signedOn')));
  redirect('/cabinet/manage/users');
}

// ─────────────────────────── Справочники ────────────────────────────────────

export async function saveType(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  const rawPrice = String(form.get('basePrice') ?? '').trim();
  const rawOrder = String(form.get('sortOrder') ?? '').trim();
  try {
    await saveServiceType(actor, {
      code: String(form.get('code') ?? ''),
      name: String(form.get('name') ?? ''),
      basePrice: rawPrice.length === 0 ? null : parseAmount(rawPrice),
      sortOrder: rawOrder.length === 0 ? undefined : Number(rawOrder),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Не удалось сохранить позицию';
    redirect(`/cabinet/manage/directory?error=${encodeURIComponent(reason)}`);
  }
  redirect('/cabinet/manage/directory');
}

export async function attachAlias(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  try {
    await addAlias(actor, String(form.get('serviceTypeId') ?? ''), String(form.get('alias') ?? ''));
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Не удалось привязать написание';
    redirect(`/cabinet/manage/directory?error=${encodeURIComponent(reason)}`);
  }
  redirect('/cabinet/manage/directory');
}

export async function detachAlias(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  await removeAlias(actor, String(form.get('aliasId') ?? ''));
  redirect('/cabinet/manage/directory');
}

/**
 * Загрузка закрывающего документа. Договор привязывается к договору, счёт
 * и акт — к траншу: иначе в перечне лежала бы стопка файлов без указания,
 * какой платёж каким актом закрыт.
 */
export async function uploadFinanceDocument(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  const code = String(form.get('code') ?? '');
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) {
    redirect(`/cabinet/projects/${code}/payments?error=empty`);
  }
  const kind = String(form.get('kind') ?? 'OTHER') as MaterialKind;
  const trancheId = String(form.get('trancheId') ?? '') || null;

  await uploadVersion(
    actor,
    {
      projectId: String(form.get('projectId') ?? ''),
      kind,
      contractId: trancheId === null ? String(form.get('contractId') ?? '') || null : null,
      trancheId,
      title: String(form.get('title') ?? '') || undefined,
      originalName: file.name,
      contentType: file.type || 'application/octet-stream',
      body: Buffer.from(await file.arrayBuffer()),
    },
    await requestIp(),
  );
  redirect(`/cabinet/projects/${code}/payments`);
}

/**
 * Загрузка материала с экрана материалов работы. От `uploadMaterial`
 * отличается только тем, куда возвращает: там экран этапа, здесь перечень
 * материалов, и материал может не иметь этапа вовсе.
 */
export async function addMaterialVersion(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  const file = form.get('file');
  const back = String(form.get('back') ?? '/cabinet/projects');
  if (!(file instanceof File) || file.size === 0) {
    throw new Error('Файл не выбран');
  }
  await uploadVersion(
    actor,
    {
      projectId: String(form.get('projectId') ?? ''),
      stageId: String(form.get('stageId') ?? '') || null,
      materialId: String(form.get('materialId') ?? '') || null,
      title: String(form.get('title') ?? '') || undefined,
      originalName: file.name,
      contentType: file.type || 'application/octet-stream',
      body: Buffer.from(await file.arrayBuffer()),
    },
    await requestIp(),
  );
  redirect(back);
}

export async function saveStageTemplate(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  const durationRaw = String(form.get('durationDays') ?? '').trim();
  try {
    await saveStageTemplateItem(actor, {
      serviceTypeId: String(form.get('serviceTypeId') ?? ''),
      title: String(form.get('title') ?? ''),
      position: Number(String(form.get('position') ?? '')),
      durationDays: durationRaw.length === 0 ? null : Number(durationRaw),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Не удалось сохранить этап шаблона';
    redirect(`/cabinet/manage/directory?error=${encodeURIComponent(reason)}`);
  }
  redirect('/cabinet/manage/directory');
}

export async function dropStageTemplate(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  await removeStageTemplateItem(actor, String(form.get('id') ?? ''));
  redirect('/cabinet/manage/directory');
}

/**
 * Вернуть недоставленное уведомление в очередь. Экран очереди служебный и
 * открыт только руководителю; право проверяет сама служба.
 */
export async function retryNotification(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  await retryFailed(actor, String(form.get('id') ?? ''), await requestIp());
  redirect('/cabinet/manage/outbox');
}
