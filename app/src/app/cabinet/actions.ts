'use server';

import { redirect } from 'next/navigation';
import { after } from 'next/server';

import { CONSENT_VERSION } from '../../lib/lead-schema';
import { AccessDenied, ensure, type Actor } from '../../lib/cabinet/access';
import { uploadFailedText } from '../../lib/cabinet/staff-texts';
import { withError } from '../../lib/cabinet/flash';
import { createManualOrder, OrderInputError } from '../../lib/cabinet/manual-order';
import { ClientChoiceNeeded } from '../../lib/cabinet/client-match';
import { homeFor } from '../../lib/cabinet/nav';
import {
  LEAD_EDIT_FIELDS,
  LeadWorkError,
  addLeadComment,
  editLead,
  setLeadStatus,
  type LeadEditField,
} from '../../lib/cabinet/lead-work';
import {
  enterWithToken,
  resendForStaleLink,
  requestLoginLink,
  revokeSession,
  createTelegramBindLink,
  unbindTelegram,
} from '../../lib/cabinet/auth';
import {
  addComment,
  moderateComment,
  moderateVersion,
  uploadVersion,
  type MaterialKind,
} from '../../lib/cabinet/materials';
import { sendInternal, sendMessage, sendStaff } from '../../lib/cabinet/messages';
import { saveAnalyticsSince, saveConfidenceThresholds, saveReactionDays } from '../../lib/cabinet/practice-settings';
import { markRecommendation } from '../../lib/cabinet/recommendations';
import { createAssignment, setAssignmentStatus } from '../../lib/cabinet/assignments';
import { addExpense, removeExpense } from '../../lib/cabinet/profit';
import { closeCheck } from '../../lib/cabinet/head-checks';
import { handBackStage, handOverStage, recallHandover } from '../../lib/cabinet/handover';
import {
  addPayout,
  addTranche,
  markPayoutPaid,
  saveContract,
  removeTranche,
  setTrancheStatus,
  rescheduleTranche,
} from '../../lib/cabinet/finance';
import { removeYear, saveYear } from '../../lib/cabinet/finance-years';
import { parseAmount, type TrancheStatus } from '../../lib/cabinet/money';
import {
  addAlias,
  createUser,
  removeAlias,
  removeCalendarDay,
  saveCalendarDay,
  saveRegalia,
  saveCuratorProfile,
  removeStageTemplateItem,
  saveServiceType,
  saveStageTemplateItem,
  saveOwnChannels,
  setUserRole,
  issueAccessLink,
  openClientAccess,
  setUserStatus,
  retryCuratorInvite,
  signExpertNda,
  requestNda,
  type Role,
} from '../../lib/cabinet/admin';
import type { AccessLinkState } from '../../components/cabinet/AccessLink';
import {
  rulesFor,
  addContact,
  closeWelcome,
  dropContact,
  preferContact,
  setFullSupport,
  saveRules,
  type ContactKind,
} from '../../lib/cabinet/channels';
import { ActiveWorkError, executeErasure, requestErasure, requestOwnErasure } from '../../lib/cabinet/erasure';
import { createCabinetRequest, REQUEST_FILES_MAX } from '../../lib/cabinet/queries';
import { applyBatch, mergeClients, previewBook } from '../../lib/cabinet/import/apply';
import { ImportError } from '../../lib/cabinet/import/zip';
import { enqueue, retryFailed, retryLeadLetter } from '../../lib/cabinet/outbox';
import { reviewFeedback } from '../../lib/cabinet/feedback';
import {
  addStage,
  editProject,
  editStage,
  approveLead,
  assignExpert,
  assignManager,
  transferAllWorks,
  declineLead,
  setProjectStatus,
  setStageState,
  editStageOutcome,
  rescheduleStage,
  moveStage,
  removeStage,
  applyStageTemplate,
  reopenStage,
  returnStage,
  acknowledgeReturn,
} from '../../lib/cabinet/projects';
import type { ProjectStatusKey } from '../../lib/cabinet/project-status';
import {
  clearOpenIntent,
  clearStaleLink,
  currentActor,
  currentSessionValue,
  rememberEmail,
  rememberStaleLink,
  requestIp,
  setSessionCookie,
  staleLink,
  userAgent,
} from '../../lib/cabinet/session';

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
 * Что сказать человеку об отказе действия (решение Р-242).
 *
 * Своё сообщение показывается только у отказов служб — обычного `Error`
 * с текстом для человека — и у отказа в праве. Сбой базы, хранилища или
 * разбора несёт в тексте имена таблиц и куски запросов: вместо него —
 * фиксированная фраза, а подробности идут в журнал сервера.
 */

function reasonOf(error: unknown, fallback: string): string {
  if (error instanceof AccessDenied) return 'Это действие недоступно для вашей роли';
  // Системная ошибка (диск, сеть) — тоже `Error`, но с кодом `ENOTDIR`,
  // `ENOSPC` и т. п. и путём на сервере в тексте: человеку она ничего не
  // скажет, а путь показывать незачем. Для неё — общая фраза (Р-255).
  const code = (error as { code?: unknown } | null)?.code;
  // Нарушение уникальности — одновременное действие из второй вкладки или
  // второго сотрудника: номер версии, позиция этапа, правило уведомлений
  // уже заняты. Данные целы, и человеку нужно действие, а не общая фраза
  // (решение Р-469).
  if (code === 'P2002') return 'Это уже изменили в другой вкладке или другой сотрудник: обновите страницу и повторите';
  const system = typeof code === 'string';
  if (error instanceof Error && error.constructor === Error && !system) return error.message;
  console.error('[cabinet] сбой действия', error);
  return fallback;
}


/**
 * Запрос ссылки входа. Ответ одинаков для любого исхода: иначе форма
 * превращается в средство проверки, кто является клиентом практики.
 */
export async function requestLink(form: FormData): Promise<void> {
  const email = String(form.get('email') ?? '');
  let outcome: Awaited<ReturnType<typeof requestLoginLink>> | null = null;
  if (email.trim().length > 0) {
    // Письмо уходит после ответа: знакомый адрес иначе отвечал бы на
    // время отправки дольше незнакомого (решение Р-239).
    // Путь возврата — с формы, куда его положил обработчик открытия; чужой
    // путь отбрасывается при записи (требование Т-06, решение Р-309).
    const next = String(form.get('next') ?? '') || null;
    outcome = await requestLoginLink(email, await requestIp(), { defer: after, next });
    // Адрес — для кнопки «Прислать ещё раз» на той же странице (Т-07, Р-313).
    if (outcome !== 'channel_off') await rememberEmail(email.trim(), next);
  }
  // Ответ один на все исходы, кроме одного: ненастроенная почта — состояние
  // системы, а не человека, и от адреса оно не зависит. Молчать о нём
  // значило бы обещать письмо, которого не будет (решение Р-163).
  redirect(outcome === 'channel_off' ? '/cabinet?channel=off' : '/cabinet?sent=1');
}

/**
 * «Прислать новую ссылку» на экране мёртвой ссылки (требование Т-07,
 * решение Р-313): новая ссылка уходит владельцу старой. Ответ один для
 * любой ссылки — адрес владельца не раскрывается ни страницей, ни исходом.
 */
export async function resendStaleLink(): Promise<void> {
  const value = await staleLink();
  await clearStaleLink();
  const outcome = value === null ? null : await resendForStaleLink(value, await requestIp(), { defer: after });
  redirect(outcome === 'channel_off' ? '/cabinet?channel=off' : '/cabinet?sent=1');
}

/**
 * Вход по одноразовой ссылке. Ключ гасится здесь, отправкой формы, а не
 * открытием страницы: предпросмотр мессенджера и проверщик ссылок в почте
 * форм не отправляют (решение Р-232).
 *
 * Сессия, с которой браузер пришёл, отзывается: прежде она оставалась
 * действительной в базе до своего срока, хотя браузер её уже забыл.
 */
export async function enterByLink(form: FormData): Promise<void> {
  const token = String(form.get('token') ?? '');
  const entered = await enterWithToken(token, await requestIp(), await userAgent());
  if (entered === null) {
    // Мёртвая ссылка: страница предложит прислать новую её владельцу, не
    // раскрывая адреса (требование Т-07, решение Р-313).
    await rememberStaleLink(token);
    redirect('/cabinet?error=link');
  }
  await revokeSession(await currentSessionValue());
  await setSessionCookie(entered.session);
  await clearOpenIntent();
  // Вход ведёт туда, куда человек шёл, — на экран из письма или сигнала
  // (требование Т-06, решение Р-309); без пути — на начальный экран роли:
  // адрес `/cabinet` при открытой сессии перенаправляет туда сам (М-05).
  redirect(entered.returnPath ?? '/cabinet');
}

export async function approveStage(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  const stageId = String(form.get('stageId') ?? '');
  let failure: string | null = null;
  try {
    await setStageState(actor, stageId, 'DONE');
  } catch (error) {
    failure = reasonOf(error, 'Не удалось согласовать этап');
  }
  if (failure !== null) redirect(await withError(`/cabinet/stages/${stageId}`, failure));
  redirect(`/cabinet/stages/${stageId}`);
}

/**
 * Практика согласует этап за клиента — только с основанием (требование
 * М-12, О-6, решение Р-292).
 */
export async function approveForClient(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  const stageId = String(form.get('stageId') ?? '');
  const basis = String(form.get('basis') ?? '');
  let failure: string | null = null;
  try {
    await setStageState(actor, stageId, 'DONE', basis);
  } catch (error) {
    failure = reasonOf(error, 'Не удалось согласовать этап за клиента');
  }
  if (failure !== null) {
    redirect(await withError(`/cabinet/stages/${stageId}`, failure, { draft: { basis } }));
  }
  redirect(`/cabinet/stages/${stageId}`);
}

/** Клиент возвращает этап с замечаниями (требование Т-03, решение Р-281). */
export async function returnStageWithRemarks(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  const stageId = String(form.get('stageId') ?? '');
  const text = String(form.get('remarks') ?? '');
  let failure: string | null = null;
  try {
    await returnStage(actor, stageId, text);
  } catch (error) {
    failure = reasonOf(error, 'Не удалось вернуть этап');
  }
  if (failure !== null) {
    redirect(await withError(`/cabinet/stages/${stageId}`, failure, { draft: { remarks: text } }));
  }
  redirect(`/cabinet/stages/${stageId}`);
}

/** Куратор принял замечания клиента в работу (требование М-04, решение Р-283). */
export async function acknowledgeStageReturn(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  const stageId = String(form.get('stageId') ?? '');
  let failure: string | null = null;
  try {
    await acknowledgeReturn(actor, stageId);
  } catch (error) {
    failure = reasonOf(error, 'Не удалось отметить замечания');
  }
  if (failure !== null) redirect(await withError(`/cabinet/stages/${stageId}`, failure));
  redirect(`/cabinet/stages/${stageId}`);
}

/** Сдать этап менеджеру с запиской (требование Э-05, решение Р-325). */
export async function handOverStageAction(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  const stageId = String(form.get('stageId') ?? '');
  const note = String(form.get('note') ?? '');
  let failure: string | null = null;
  try {
    await handOverStage(actor, stageId, note);
  } catch (error) {
    failure = reasonOf(error, 'Не удалось сдать этап');
  }
  if (failure !== null) {
    redirect(await withError(`/cabinet/stages/${stageId}`, failure, { draft: { note } }));
  }
  redirect(`/cabinet/stages/${stageId}`);
}

/** Отозвать сдачу, пока менеджер не принял решение (Э-05). */
export async function recallHandoverAction(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  const stageId = String(form.get('stageId') ?? '');
  let failure: string | null = null;
  try {
    await recallHandover(actor, stageId);
  } catch (error) {
    failure = reasonOf(error, 'Не удалось отозвать сдачу');
  }
  if (failure !== null) redirect(await withError(`/cabinet/stages/${stageId}`, failure));
  redirect(`/cabinet/stages/${stageId}`);
}

/** Вернуть сданный этап куратору с причиной (Э-05, сторона М-25). */
export async function handBackStageAction(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  const stageId = String(form.get('stageId') ?? '');
  const reason = String(form.get('reason') ?? '');
  let failure: string | null = null;
  try {
    await handBackStage(actor, stageId, reason);
  } catch (error) {
    failure = reasonOf(error, 'Не удалось вернуть этап куратору');
  }
  if (failure !== null) {
    redirect(await withError(`/cabinet/stages/${stageId}`, failure, { draft: { handback: reason } }));
  }
  redirect(`/cabinet/stages/${stageId}`);
}

export async function changeStageState(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  const stageId = String(form.get('stageId') ?? '');
  const to = String(form.get('state') ?? '') as Parameters<typeof setStageState>[2];
  const reason = String(form.get('reason') ?? '');
  let failure: string | null = null;
  try {
    await setStageState(actor, stageId, to, reason);
  } catch (error) {
    failure = reasonOf(error, 'Не удалось сменить состояние этапа');
  }
  // Набранный итог возвращается в форму вместе с причиной отказа
  // (решения Р-279, Р-289).
  if (failure !== null) {
    redirect(
      await withError(
        `/cabinet/stages/${stageId}`,
        failure,
        to === 'IN_APPROVAL' ? { draft: { outcome: reason } } : {},
      ),
    );
  }
  redirect(`/cabinet/stages/${stageId}`);
}

/** Правка итога этапа на согласовании (требование Т-14, решение Р-289). */
export async function saveStageOutcome(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  const stageId = String(form.get('stageId') ?? '');
  const text = String(form.get('outcome') ?? '');
  let failure: string | null = null;
  try {
    await editStageOutcome(actor, stageId, text);
  } catch (error) {
    failure = reasonOf(error, 'Не удалось сохранить итог этапа');
  }
  if (failure !== null) {
    redirect(await withError(`/cabinet/stages/${stageId}`, failure, { draft: { outcome: text } }));
  }
  redirect(`/cabinet/stages/${stageId}`);
}

export async function commentOnVersion(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  const versionId = String(form.get('versionId') ?? '');
  const stageId = String(form.get('stageId') ?? '');
  let failure: string | null = null;
  try {
    await addComment(actor, versionId, String(form.get('body') ?? ''));
  } catch (error) {
    failure = reasonOf(error, 'Не удалось сохранить замечание');
  }
  if (failure !== null) redirect(await withError(`/cabinet/stages/${stageId}`, failure));
  redirect(`/cabinet/stages/${stageId}`);
}

export async function uploadMaterial(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) {
    redirect(await withError(`/cabinet/stages/${String(form.get('stageId') ?? '')}`, 'Файл не выбран'));
  }
  const stageId = String(form.get('stageId') ?? '');
  const projectId = String(form.get('projectId') ?? '');
  const materialId = String(form.get('materialId') ?? '');
  // Отказ загрузки — контакт в названии, неподходящий файл, недоступное
  // хранилище — возвращается на экран этапа причиной, а не общим экраном
  // сбоя (решение Р-255). Перенаправление вне `try`: оно само — исключение.
  let failure: string | null = null;
  try {
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
  } catch (error) {
    failure = reasonOf(error, uploadFailedText(actor.role));
  }
  if (failure !== null) redirect(await withError(`/cabinet/stages/${stageId}`, failure));
  redirect(`/cabinet/stages/${stageId}`);
}

/**
 * Новый материал с пояснением — форма эксперта на экране работы.
 *
 * От `uploadMaterial` отличается двумя вещами: материал заводится с
 * названием («глава 2 диссертации»), а пояснение к нему кладётся
 * замечанием к той же версии — отдельной формы для этого не нужно
 * (решение Р-200).
 */
/**
 * Материал с пояснением из колонки «Ваша работа». Файл и пояснение
 * проверяются до записи и сохраняются одной операцией; при отказе не
 * сохраняется ничего, а название, пояснение и этап возвращаются в форму —
 * файл браузер заново не подставляет (требование Э-06, решение Р-326).
 */
export async function uploadMaterialWithNote(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  const file = form.get('file');
  const code = String(form.get('code') ?? '');
  const stageId = String(form.get('stageId') ?? '');
  const title = String(form.get('title') ?? '');
  const note = String(form.get('note') ?? '');
  const draft = { title, note, stageId: stageId === '' ? 'none' : stageId };
  if (!(file instanceof File) || file.size === 0) {
    redirect(await withError(`/cabinet/projects/${code}`, 'Файл не выбран', { draft }));
  }
  let failure: string | null = null;
  try {
    await uploadVersion(
      actor,
      {
        projectId: String(form.get('projectId') ?? ''),
        stageId: stageId || null,
        materialId: null,
        title: title || undefined,
        note,
        originalName: (file as File).name,
        contentType: (file as File).type || 'application/octet-stream',
        body: Buffer.from(await (file as File).arrayBuffer()),
      },
      await requestIp(),
    );
  } catch (error) {
    failure = reasonOf(error, uploadFailedText(actor.role));
  }
  if (failure !== null) {
    redirect(await withError(`/cabinet/projects/${code}`, `${failure}. Выберите файл ещё раз.`, { draft }));
  }

  redirect(`/cabinet/projects/${code}`);
}

export async function moderateLead(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  ensure(actor, 'REQUEST_MODERATE');
  const leadId = String(form.get('leadId') ?? '');
  // Отказ службы — фразой на экране заявки, а не общим экраном сбоя:
  // пустое название или выведенный из оборота тип прежде кончались
  // «Сбоем» без объяснения (решение Р-251).
  let failure: string | null = null;
  let code: string | null = null;
  try {
    if (String(form.get('decision') ?? '') === 'decline') {
      await declineLead(actor, leadId, String(form.get('reason') ?? ''));
    } else {
      const project = await approveLead(actor, {
        leadId,
        serviceTypeId: String(form.get('serviceTypeId') ?? ''),
        // Руководитель выбирает менеджера работы; менеджер ведёт её сам
        // (требование РК-08, решение Р-344).
        managerId: String(form.get('managerId') ?? ''),
        title: String(form.get('title') ?? ''),
        applyStageTemplate: form.get('applyTemplate') === 'on',
      });
      code = project.code;
    }
  } catch (error) {
    failure = reasonOf(error, 'Не удалось разобрать заявку');
  }
  if (failure !== null) redirect(await withError(`/cabinet/manage/leads/${leadId}`, failure));
  // После отказа — назад на экран заявки: там виден исход — причина и
  // судьба письма.
  redirect(code === null ? `/cabinet/manage/leads/${leadId}` : `/cabinet/projects/${code}`);
}

export async function createStage(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  const projectId = String(form.get('projectId') ?? '');
  const code = String(form.get('code') ?? '');
  let failure: string | null = null;
  try {
    await addStage(actor, {
      projectId,
      title: String(form.get('title') ?? ''),
      summary: String(form.get('summary') ?? ''),
      dueOn: dateOrNull(form.get('dueOn')),
    });
  } catch (error) {
    failure = reasonOf(error, 'Не удалось завести этап');
  }
  if (failure !== null) redirect(await withError(`/cabinet/projects/${code}`, failure));
  redirect(`/cabinet/projects/${code}`);
}

/** Перестановка этапа в плане (требование М-11, решение Р-303). */
export async function shiftStage(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  const code = String(form.get('code') ?? '');
  let failure: string | null = null;
  try {
    await moveStage(actor, String(form.get('stageId') ?? ''), form.get('direction') === 'up' ? 'up' : 'down');
  } catch (error) {
    failure = reasonOf(error, 'Не удалось переставить этап');
  }
  if (failure !== null) redirect(await withError(`/cabinet/projects/${code}`, failure));
  redirect(`/cabinet/projects/${code}`);
}

/** Удаление не начатого этапа без материалов (М-11, Р-303). */
export async function dropStage(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  const code = String(form.get('code') ?? '');
  let failure: string | null = null;
  try {
    await removeStage(actor, String(form.get('stageId') ?? ''));
  } catch (error) {
    failure = reasonOf(error, 'Не удалось удалить этап');
  }
  if (failure !== null) redirect(await withError(`/cabinet/projects/${code}`, failure));
  redirect(`/cabinet/projects/${code}`);
}

/** План по шаблону типа на карточке, пока этапов нет (М-11, Р-303). */
export async function planFromTemplate(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  const code = String(form.get('code') ?? '');
  let failure: string | null = null;
  try {
    await applyStageTemplate(actor, String(form.get('projectId') ?? ''));
  } catch (error) {
    failure = reasonOf(error, 'Не удалось завести план по шаблону');
  }
  if (failure !== null) redirect(await withError(`/cabinet/projects/${code}`, failure));
  redirect(`/cabinet/projects/${code}`);
}

/** Возврат завершённого этапа в работу — с причиной (М-11, Р-303). */
export async function reopenStageAction(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  const stageId = String(form.get('stageId') ?? '');
  const reason = String(form.get('reason') ?? '');
  let failure: string | null = null;
  try {
    await reopenStage(actor, { stageId, reason, dueOn: dateOrNull(form.get('dueOn')) });
  } catch (error) {
    failure = reasonOf(error, 'Не удалось вернуть этап в работу');
  }
  if (failure !== null) {
    redirect(await withError(`/cabinet/stages/${stageId}`, failure, { draft: { reopenReason: reason } }));
  }
  redirect(`/cabinet/stages/${stageId}`);
}

/** Правка этапа менеджером прямо в плане работ (решение Р-190). */
export async function saveStage(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  const code = String(form.get('code') ?? '');
  let failure: string | null = null;
  try {
    await editStage(actor, {
      stageId: String(form.get('stageId') ?? ''),
      title: String(form.get('title') ?? ''),
      summary: String(form.get('summary') ?? ''),
      dueOn: dateOrNull(form.get('dueOn')),
      reason: String(form.get('reason') ?? ''),
      updatedAt: String(form.get('updatedAt') ?? '') || null,
    });
  } catch (error) {
    failure = reasonOf(error, 'Не удалось сохранить этап');
  }
  if (failure !== null) redirect(await withError(`/cabinet/projects/${code}`, failure));
  redirect(`/cabinet/projects/${code}`);
}

/**
 * Перенос срока прямо с экрана этапа (решение Р-199).
 *
 * Отличается от `saveStage` только тем, куда возвращает: менеджер
 * переносит срок, не уходя с этапа, и продолжает разбирать его дальше.
 */
export async function moveStageDue(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  const stageId = String(form.get('stageId') ?? '');
  const reason = String(form.get('reason') ?? '');
  let failure: string | null = null;
  try {
    // Меняется только срок: скрытые название и суть откатывали правку,
    // сделанную в другом окне (требование М-15, решение Р-302).
    await rescheduleStage(actor, { stageId, dueOn: dateOrNull(form.get('dueOn')), reason });
  } catch (error) {
    failure = reasonOf(error, 'Не удалось перенести срок');
  }
  if (failure !== null) {
    redirect(
      await withError(`/cabinet/stages/${stageId}`, failure, {
        draft: { dueOn: String(form.get('dueOn') ?? ''), dueReason: reason },
      }),
    );
  }
  redirect(`/cabinet/stages/${stageId}`);
}

/**
 * Отказ действия «Управления работой»: причина у своей формы, свёртка
 * раскрыта, введённое сохранено (решение Р-279). Прежде четыре действия
 * карточки работы отказывали общим экраном «Сбой» — менеджер не узнавал,
 * что исправить.
 */
async function manageFailure(
  code: string,
  slot: 'project' | 'status' | 'expert' | 'manager',
  error: unknown,
  draft: Readonly<Record<string, string>>,
): Promise<never> {
  const reason = reasonOf(error, 'Не удалось сохранить: попробуйте ещё раз. Введённое сохранено в форме.');
  redirect(await withError(`/cabinet/projects/${code}`, reason, { slot, draft, anchor: 'manage' }));
}

/** Значения полей формы — для черновика при отказе. */
function fieldsOf(form: FormData, names: readonly string[]): Record<string, string> {
  return Object.fromEntries(names.map((name) => [name, String(form.get(name) ?? '')]));
}

/** Правка карточки работы менеджером (решение Р-190). */
export async function saveProject(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  const code = String(form.get('code') ?? '');
  try {
    await editProject(actor, {
      projectId: String(form.get('projectId') ?? ''),
      title: String(form.get('title') ?? ''),
      topic: String(form.get('topic') ?? ''),
      summary: String(form.get('summary') ?? ''),
      dueOn: dateOrNull(form.get('dueOn')),
      reason: String(form.get('dueReason') ?? ''),
      // Поле есть только у формы карточки; пустое значение не меняет срок.
      ...(String(form.get('approvalDays') ?? '').trim() === ''
        ? {}
        : { approvalDays: Number(String(form.get('approvalDays')).trim()) }),
    });
  } catch (error) {
    await manageFailure(
      code,
      'project',
      error,
      fieldsOf(form, ['title', 'topic', 'summary', 'dueOn', 'dueReason', 'approvalDays']),
    );
  }
  redirect(`/cabinet/projects/${code}`);
}

/** Смена состояния работы куратором или руководителем (решение Р-223). */
export async function changeProjectStatus(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  const code = String(form.get('code') ?? '');
  const status = String(form.get('status') ?? '');
  const reason = String(form.get('reason') ?? '');
  let failure: string | null = null;
  try {
    await setProjectStatus(actor, String(form.get('projectId') ?? ''), status as ProjectStatusKey, reason);
  } catch (error) {
    failure = reasonOf(error, 'Не удалось сменить состояние работы');
  }
  // Отказ — на экране подтверждения, с набранной причиной (М-09, Р-279).
  if (failure !== null) {
    redirect(
      await withError(`/cabinet/projects/${code}/status?to=${encodeURIComponent(status)}`, failure, {
        draft: { reason },
      }),
    );
  }
  redirect(`/cabinet/projects/${code}`);
}

export async function setExpert(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  const projectId = String(form.get('projectId') ?? '');
  const code = String(form.get('code') ?? '');
  const expertId = String(form.get('expertId') ?? '');
  const expertRole = String(form.get('expertRole') ?? '');
  try {
    await assignExpert(
      actor,
      projectId,
      expertId || null,
      (expertRole || null) as Parameters<typeof assignExpert>[3],
    );
  } catch (error) {
    await manageFailure(code, 'expert', error, { expertId, expertRole });
  }
  redirect(`/cabinet/projects/${code}`);
}

/** Передача работы другому менеджеру — с причиной. Доступна руководителю. */
export async function setManager(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  const projectId = String(form.get('projectId') ?? '');
  const code = String(form.get('code') ?? '');
  const managerId = String(form.get('managerId') ?? '');
  const reason = String(form.get('reason') ?? '');
  try {
    await assignManager(actor, projectId, managerId, reason);
  } catch (error) {
    await manageFailure(code, 'manager', error, { managerId, reason });
  }
  redirect(`/cabinet/projects/${code}`);
}

/** Передать все действующие работы менеджера (улучшение УР-07, Р-397). */
export async function transferWorks(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  const fromId = String(form.get('fromManagerId') ?? '');
  const back = `/cabinet/projects?state=active&manager=${encodeURIComponent(fromId)}`;
  let failure: string | null = null;
  try {
    if (form.get('confirm') !== 'on') throw new Error('Подтвердите передачу: работы уйдут другому менеджеру');
    const result = await transferAllWorks(actor, fromId, String(form.get('toManagerId') ?? ''), String(form.get('reason') ?? ''));
    if (result.failed !== null) failure = `Передано работ: ${result.moved}. Остановлено на ${result.failed}`;
  } catch (error) {
    failure = reasonOf(error, 'Не удалось передать работы');
  }
  if (failure !== null) redirect(await withError(back, failure));
  redirect(back);
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
  // Замечание вне этапа разбирается на «Материалах работы»: возврат туда,
  // к своему материалу. Адрес возврата — только экран материалов работы:
  // поле формы иначе стало бы перенаправлением куда угодно (решение Р-284).
  const back = String(form.get('back') ?? '');
  const backMatch = /^\/cabinet\/projects\/[A-Za-zА-Яа-я0-9-]+\/materials(#material-[a-z0-9]+)?$/u.exec(back);
  const target = stageId !== '' ? `/cabinet/stages/${stageId}` : backMatch !== null ? back : '/cabinet/projects';
  let failure: string | null = null;
  try {
    await moderateComment(actor, commentId, decision, String(form.get('note') ?? ''));
  } catch (error) {
    failure = reasonOf(error, 'Не удалось разобрать замечание');
  }
  if (failure !== null) {
    const [path, anchor] = target.split('#');
    redirect(await withError(path!, failure, anchor === undefined ? {} : { anchor }));
  }
  redirect(target);
}

/**
 * Опубликовать версию эксперта клиенту или не публиковать (требование
 * Т-18, решение Р-294). Возврат — на экран этапа или к материалу на
 * «Материалах работы», как у замечаний (Р-284).
 */
export async function decideOnVersion(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  const versionId = String(form.get('versionId') ?? '');
  const stageId = String(form.get('stageId') ?? '');
  const decision = String(form.get('decision') ?? '') === 'publish' ? 'PUBLISHED' : 'REJECTED';
  const note = String(form.get('note') ?? '');
  const back = String(form.get('back') ?? '');
  const backMatch = /^\/cabinet\/projects\/[A-Za-zА-Яа-я0-9-]+\/materials(#material-[a-z0-9]+)?$/u.exec(back);
  const target = stageId !== '' ? `/cabinet/stages/${stageId}` : backMatch !== null ? back : '/cabinet/projects';
  let failure: string | null = null;
  try {
    await moderateVersion(actor, versionId, decision, note);
  } catch (error) {
    failure = reasonOf(error, 'Не удалось разобрать версию');
  }
  if (failure !== null) {
    const [path, anchor] = target.split('#');
    redirect(
      await withError(path!, failure, {
        ...(anchor === undefined ? {} : { anchor }),
        draft: { note },
      }),
    );
  }
  redirect(target);
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

  // Отказ — на экран заявки с набранным, а не общим экраном сбоя
  // (требование Т-22, решения Р-279, Р-296).
  let filesLost = 0;
  let failure: string | null = null;
  try {
    ({ filesLost } = await createCabinetRequest(
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
        consent: form.get('consent') === 'on',
        terms: form.get('terms') === 'on',
      },
      CONSENT_VERSION,
    ));
  } catch (error) {
    failure = reasonOf(error, 'Не удалось отправить заявку');
  }
  if (failure !== null) {
    redirect(
      await withError('/cabinet/request', failure, {
        draft: fieldsOf(form, [
          'applicantName',
          'supervisorName',
          'need',
          'topic',
          'deadline',
          'message',
          'organization',
          'speciality',
          'phone',
        ]),
      }),
    );
  }

  redirect(filesLost > 0 ? `/cabinet/request?sent=1&lost=${filesLost}` : '/cabinet/request?sent=1');
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
  let failure: string | null = null;
  try {
    await sendMessage(actor, projectId, String(form.get('body') ?? ''));
  } catch (error) {
    failure = reasonOf(error, 'Не удалось отправить сообщение');
  }
  const back = String(form.get('back') ?? '');
  const target =
    back === 'project' ? `/cabinet/projects/${code}` : `/cabinet/projects/${code}/messages`;
  if (failure !== null) redirect(await withError(target, failure));
  redirect(target);
}

/**
 * Шаг экрана настроек: отказ — причиной на экране настроек, а не экраном
 * «Сбой» (улучшение УМ-02, решение Р-373; приём Р-279).
 */
async function settingsStep<T>(task: () => Promise<T>, fallback: string): Promise<T> {
  let failure: string | null = null;
  let result: T | undefined;
  try {
    result = await task();
  } catch (error) {
    failure = reasonOf(error, fallback);
  }
  if (failure !== null) redirect(await withError('/cabinet/settings', failure));
  return result as T;
}

/** Каналы уведомлений. Выбор за получателем, а не за системой. */
export async function saveNotificationChannels(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  await settingsStep(
    () =>
      saveOwnChannels(actor, {
        email: form.get('notifyEmail') === 'on',
        telegram: form.get('notifyTelegram') === 'on',
        // Поле есть только у куратора (УЭ-01, Р-398).
        ...(form.has('digestShown') ? { dailyDigest: form.get('dailyDigest') === 'on' } : {}),
      }),
    'Не удалось сохранить каналы уведомлений',
  );
  redirect('/cabinet/settings?saved=1');
}

export async function addContactChannel(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  const kind = String(form.get('kind') ?? '') as ContactKind;
  try {
    await addContact(actor, {
      kind,
      value: String(form.get('value') ?? ''),
      note: String(form.get('note') ?? ''),
      preferred: form.get('preferred') === 'on',
    });
  } catch (error) {
    const text = reasonOf(error, 'Не удалось добавить способ связи');
    redirect(await withError(`/cabinet/settings`, text));
  }
  redirect('/cabinet/settings?saved=1');
}

export async function removeContactChannel(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  await settingsStep(() => dropContact(actor, String(form.get('id') ?? '')), 'Не удалось убрать способ связи');
  redirect('/cabinet/settings?saved=1');
}

/** Полное сопровождение — отдельной отметкой клиента (часть F, П-09, Р-401). */
export async function saveFullSupport(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  await settingsStep(
    () => setFullSupport(actor, form.get('fullSupport') === 'on'),
    'Не удалось сохранить полное сопровождение',
  );
  redirect('/cabinet/settings?saved=1');
}

export async function makeContactPreferred(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  await settingsStep(() => preferContact(actor, String(form.get('id') ?? '')), 'Не удалось отметить способ связи');
  redirect('/cabinet/settings?saved=1');
}

export async function saveNotifyRules(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  // Форма присылает состояние всей решётки: у каждой клетки своё имя
  // вида `rule:<событие>:<канал>`, и снятая галочка просто не приходит.
  const rules = rulesFor(actor.role).flatMap((event) =>
    (['EMAIL', 'TELEGRAM'] as const).map((channel) => ({
      eventKind: event.kind,
      channel,
      enabled: form.get(`rule:${event.kind}:${channel}`) === 'on',
    })),
  );
  await settingsStep(() => saveRules(actor, rules), 'Не удалось сохранить правила уведомлений');
  redirect('/cabinet/settings?saved=1');
}

/**
 * Сообщение во внутренней переписке по работе (требование РК-07, решение
 * Р-336). При отказе текст возвращается в поле.
 */
export async function postInternalMessage(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  const code = String(form.get('code') ?? '');
  const body = String(form.get('body') ?? '');
  const target = `/cabinet/projects/${code}/messages?tab=internal`;
  let failure: string | null = null;
  try {
    await sendInternal(actor, String(form.get('projectId') ?? ''), body);
  } catch (error) {
    failure = reasonOf(error, 'Не удалось отправить сообщение');
  }
  if (failure !== null) redirect(await withError(target, failure, { draft: { body } }));
  redirect(target);
}

/**
 * Сообщение в ветке «руководитель — сотрудник» (РК-07, Р-336): менеджер
 * пишет со своего экрана «Руководитель», руководитель — с экрана ветки.
 */
export async function postStaffMessage(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  const staffId = String(form.get('staffId') ?? '');
  const body = String(form.get('body') ?? '');
  const target = actor.role === 'HEAD' ? `/cabinet/manage/team/${staffId}` : '/cabinet/head';
  let failure: string | null = null;
  try {
    await sendStaff(actor, staffId, body);
  } catch (error) {
    failure = reasonOf(error, 'Не удалось отправить сообщение');
  }
  if (failure !== null) redirect(await withError(target, failure, { draft: { body } }));
  redirect(target);
}

/**
 * Ссылка привязки Telegram — по нажатию (решение Р-245): метка заводится
 * здесь, и человек сразу уходит в бота.
 */
/** «Понятно» в блоке первого входа (требование Т-10, решение Р-310). */
export async function dismissWelcome(): Promise<void> {
  const actor = await actorOrRedirect();
  await closeWelcome(actor);
  redirect(homeFor(actor));
}

export async function startTelegramBind(): Promise<void> {
  const actor = await actorOrRedirect();
  const link = await settingsStep(
    () => createTelegramBindLink(actor.id),
    'Не удалось подготовить подключение Telegram',
  );
  if (link === null) {
    redirect(await withError('/cabinet/settings', 'Telegram не настроен на стороне сервиса'));
  }
  redirect(link);
}

export async function dropTelegram(): Promise<void> {
  const actor = await actorOrRedirect();
  await settingsStep(() => unbindTelegram(actor), 'Не удалось отключить Telegram');
  redirect('/cabinet/settings?saved=1');
}

/** Дата из поля формы. Пустое значение — это отсутствие даты, а не «сегодня». */
function dateOrNull(value: FormDataEntryValue | null): Date | null {
  const raw = String(value ?? '').trim();
  if (raw.length === 0) return null;
  const date = new Date(`${raw}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Работа с заявкой до решения: состояние плашкой, правка сведений и
 * внутренний комментарий (решение Р-270). Каждое действие возвращает на
 * экран заявки; отказ — с причиной.
 */
async function leadStep(form: FormData, step: (actor: Actor, leadId: string) => Promise<void>, fallback: string) {
  const actor = await actorOrRedirect();
  const leadId = String(form.get('leadId') ?? '');
  const back = `/cabinet/manage/leads/${leadId}`;
  let failure: string | null = null;
  try {
    await step(actor, leadId);
  } catch (error) {
    failure = error instanceof LeadWorkError ? error.message : reasonOf(error, fallback);
  }
  if (failure !== null) redirect(await withError(back, failure));
  redirect(back);
}

export async function switchLeadStatus(form: FormData): Promise<void> {
  await leadStep(form, (actor, id) => setLeadStatus(actor, id, String(form.get('status') ?? '')), 'Не удалось сменить состояние');
}

export async function saveLead(form: FormData): Promise<void> {
  const values: Partial<Record<LeadEditField, string>> = {};
  for (const field of LEAD_EDIT_FIELDS) {
    const value = form.get(field);
    if (value !== null) values[field] = String(value);
  }
  await leadStep(form, (actor, id) => editLead(actor, id, values), 'Не удалось сохранить заявку');
}

export async function commentLead(form: FormData): Promise<void> {
  await leadStep(form, (actor, id) => addLeadComment(actor, id, String(form.get('body') ?? '')), 'Не удалось сохранить комментарий');
}

/**
 * Новый заказ, заведённый руководителем или менеджером вручную (Р-269).
 * При ошибке ввода форма возвращается с причиной, а не теряется.
 */
export async function createOrder(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  const text = (name: string) => String(form.get(name) ?? '').trim();
  let failure: string | null = null;
  let code: string | null = null;
  let choiceNeeded = false;
  try {
    const amountOf = (name: string): bigint | null => (text(name).length === 0 ? null : parseAmount(text(name)));
    const status = text('status');
    const created = await createManualOrder(actor, {
      customer: text('customer'),
      email: text('email') || null,
      phone: text('phone') || null,
      serviceTypeId: text('serviceTypeId'),
      title: text('title'),
      topic: text('topic') || null,
      orderedOn: dateOrNull(form.get('orderedOn')),
      dueOn: dateOrNull(form.get('dueOn')),
      cost: amountOf('cost'),
      paid: amountOf('paid'),
      status: status === 'PAUSED' || status === 'COMPLETED' ? status : 'ACTIVE',
      managerId: text('managerId') || null,
      clientChoice: text('clientChoice') || null,
    });
    code = created.code;
  } catch (error) {
    failure =
      error instanceof OrderInputError || error instanceof ClientChoiceNeeded
        ? error.message
        : reasonOf(error, 'Не удалось завести заказ');
    choiceNeeded = error instanceof ClientChoiceNeeded;
  }
  if (failure !== null || code === null) {
    // Набранное возвращается в форму; совпадение только по ФИО открывает
    // выбор карточки заказчика (требование М-18, решение Р-308).
    const fields = ['customer', 'email', 'phone', 'serviceTypeId', 'title', 'topic', 'orderedOn', 'dueOn', 'cost', 'paid', 'status', 'managerId'];
    const draft: Record<string, string> = Object.fromEntries(fields.map((name) => [name, text(name)]));
    if (choiceNeeded) draft.clientChoiceNeeded = '1';
    redirect(await withError('/cabinet/manage/orders/new', failure ?? 'Не удалось завести заказ', { draft }));
  }
  redirect(`/cabinet/projects/${code}?created=1`);
}

export async function saveProjectContract(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  const projectId = String(form.get('projectId') ?? '');
  const code = String(form.get('code') ?? '');
  const back = `/cabinet/projects/${code}/payments`;
  let failure: string | null = null;
  try {
    await saveContract(actor, {
      projectId,
      number: String(form.get('number') ?? ''),
      signedOn: dateOrNull(form.get('signedOn')),
      totalAmount: parseAmount(String(form.get('totalAmount') ?? '')),
    });
  } catch (error) {
    failure = reasonOf(error, 'Не удалось сохранить договор');
  }
  if (failure !== null) redirect(await withError(back, failure));
  redirect(back);
}

export async function addContractTranche(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  const code = String(form.get('code') ?? '');
  const back = `/cabinet/projects/${code}/payments`;
  let exceeds = false;
  let failure: string | null = null;
  try {
    const { exceedsContract } = await addTranche(actor, {
      contractId: String(form.get('contractId') ?? ''),
      title: String(form.get('title') ?? ''),
      amount: parseAmount(String(form.get('amount') ?? '')),
      plannedDate: dateOrNull(form.get('plannedDate')),
      stageId: String(form.get('stageId') ?? '') || null,
    });
    exceeds = exceedsContract;
  } catch (error) {
    failure = reasonOf(error, 'Не удалось добавить транш');
  }
  if (failure !== null) redirect(await withError(back, failure));
  // Превышение суммы договора показывается на экране, а не теряется
  // (решение Р-224).
  redirect(`${back}${exceeds ? '?exceeds=1' : ''}`);
}

export async function changeTrancheStatus(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  const code = String(form.get('code') ?? '');
  const back = `/cabinet/projects/${code}/payments`;
  let failure: string | null = null;
  try {
    await setTrancheStatus(
      actor,
      String(form.get('trancheId') ?? ''),
      String(form.get('status') ?? '') as TrancheStatus,
      dateOrNull(form.get('paidOn')),
      String(form.get('reason') ?? ''),
    );
  } catch (error) {
    failure = reasonOf(error, 'Не удалось сменить статус транша');
  }
  if (failure !== null) redirect(await withError(back, failure));
  redirect(back);
}

/** Удалить введённый год — после подтверждения второй формой (РК-15, Р-346). */
export async function removeFinanceYear(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  const back = '/cabinet/manage/finance/years';
  let failure: string | null = null;
  try {
    await removeYear(actor, Number(String(form.get('year') ?? '')));
  } catch (error) {
    failure = reasonOf(error, 'Не удалось удалить год');
  }
  if (failure !== null) redirect(await withError(back, failure));
  redirect(`${back}?removed=1`);
}

/** «Должники»: перенести плановую дату транша с причиной (РК-10, Р-345). */
export async function moveTrancheDate(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  const back = '/cabinet/manage/finance/debtors';
  let failure: string | null = null;
  try {
    await rescheduleTranche(
      actor,
      String(form.get('trancheId') ?? ''),
      dateOrNull(form.get('plannedDate')),
      String(form.get('reason') ?? ''),
    );
  } catch (error) {
    failure = reasonOf(error, 'Не удалось перенести дату транша');
  }
  if (failure !== null) redirect(await withError(back, failure));
  redirect(`${back}?moved=1`);
}

/** «Должники»: списать долг — только с подтверждением (РК-10, Р-345; Р-244). */
export async function writeOffDebt(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  const back = '/cabinet/manage/finance/debtors';
  let failure: string | null = null;
  try {
    if (form.get('confirm') !== 'on') throw new Error('Подтвердите списание: долг больше не будет ждать оплаты');
    await setTrancheStatus(actor, String(form.get('trancheId') ?? ''), 'WRITTEN_OFF', null, String(form.get('reason') ?? ''));
  } catch (error) {
    failure = reasonOf(error, 'Не удалось списать транш');
  }
  if (failure !== null) redirect(await withError(back, failure));
  redirect(back);
}

/** Удалить ошибочно заведённый плановый транш (решение Р-244). */
export async function dropTranche(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  const code = String(form.get('code') ?? '');
  const back = `/cabinet/projects/${code}/payments`;
  let failure: string | null = null;
  try {
    await removeTranche(actor, String(form.get('trancheId') ?? ''));
  } catch (error) {
    failure = reasonOf(error, 'Не удалось удалить транш');
  }
  if (failure !== null) redirect(await withError(back, failure));
  redirect(back);
}

export async function saveFinanceYear(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  const note = String(form.get('note') ?? '').trim();
  const back = '/cabinet/manage/finance/years';
  let failure: string | null = null;
  try {
    await saveYear(actor, {
      year: Number(String(form.get('year') ?? '').trim()),
      revenue: parseAmount(String(form.get('revenue') ?? '')),
      costs: parseAmount(String(form.get('costs') ?? '')),
      note: note.length === 0 ? null : note,
    });
  } catch (error) {
    failure = reasonOf(error, 'Не удалось сохранить итог года');
  }
  if (failure !== null) redirect(await withError(back, failure));
  redirect(back);
}

export async function accruePayout(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  const code = String(form.get('code') ?? '');
  const back = `/cabinet/projects/${code}/payments`;
  let failure: string | null = null;
  try {
    await addPayout(actor, {
      projectId: String(form.get('projectId') ?? ''),
      stageId: String(form.get('stageId') ?? '') || null,
      amount: parseAmount(String(form.get('amount') ?? '')),
      comment: String(form.get('comment') ?? '') || null,
    });
  } catch (error) {
    failure = reasonOf(error, 'Не удалось начислить');
  }
  if (failure !== null) redirect(await withError(back, failure));
  redirect(back);
}

export async function payPayout(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  const code = String(form.get('code') ?? '');
  const back = `/cabinet/projects/${code}/payments`;
  let failure: string | null = null;
  try {
    const paidOn = dateOrNull(form.get('paidOn'));
    if (paidOn === null) throw new Error('Для выплаты нужна дата');
    await markPayoutPaid(actor, String(form.get('payoutId') ?? ''), paidOn);
  } catch (error) {
    failure = reasonOf(error, 'Не удалось отметить выплату');
  }
  if (failure !== null) redirect(await withError(back, failure));
  redirect(back);
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

  let failure: string | null = null;
  try {
    await applyBatch(actor, batchId, { managerId, excludeRows });
  } catch (error) {
    failure = reasonOf(error, 'Не удалось зафиксировать загрузку');
  }
  // Отказ — фразой на экране загрузки: куратор не из числа сотрудников
  // или загрузка уже зафиксирована (решение Р-251).
  if (failure !== null) redirect(await withError(`/cabinet/manage/import/${batchId}`, failure));
  redirect(`/cabinet/manage/import/${batchId}?applied=1`);
}

export async function mergeClientCards(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  const batchId = String(form.get('batchId') ?? '');
  const back = `/cabinet/manage/import/${batchId}`;
  let failure: string | null = null;
  try {
    await mergeClients(
      actor,
      String(form.get('sourceId') ?? ''),
      String(form.get('targetId') ?? ''),
    );
  } catch (error) {
    failure = reasonOf(error, 'Не удалось свести карточки');
  }
  if (failure !== null) redirect(await withError(back, failure));
  redirect(`${back}?merged=1`);
}

/** Принять требование субъекта об удалении данных. Исполнение — отдельным действием. */
export async function openErasureRequest(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  const scope = String(form.get('scope') ?? 'PERSONAL_DATA_AND_FILES');
  let failure: string | null = null;
  try {
    await requestErasure(
      actor,
      String(form.get('clientId') ?? ''),
      scope === 'PERSONAL_DATA' ? 'PERSONAL_DATA' : 'PERSONAL_DATA_AND_FILES',
    );
  } catch (error) {
    // Второе требование по карточке — причиной на экране, а не страницей
    // ошибки (решение Р-468).
    failure = reasonOf(error, 'Не удалось принять требование');
  }
  if (failure !== null) redirect(await withError('/cabinet/manage/erasure', failure));
  redirect('/cabinet/manage/erasure');
}

/** Клиент запрашивает удаление своих данных (часть F, П-08, Р-400). */
export async function requestMyErasure(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  let failure: string | null = null;
  try {
    if (form.get('confirm') !== 'on') throw new Error('Подтвердите запрос: он уйдёт руководителю практики');
    await requestOwnErasure(actor);
  } catch (error) {
    failure = reasonOf(error, 'Не удалось отправить запрос');
  }
  if (failure !== null) redirect(await withError('/cabinet/settings', failure));
  redirect('/cabinet/settings?saved=1');
}

export async function executeErasureRequest(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  try {
    await executeErasure(actor, String(form.get('requestId') ?? ''));
  } catch (error) {
    // Отказ из-за действующих работ — не сбой, а условие: экран называет
    // коды работ, которые надо закрыть (решение Р-234).
    if (error instanceof ActiveWorkError) {
      redirect(`/cabinet/manage/erasure?active=${encodeURIComponent(error.codes.join(','))}`);
    }
    throw error;
  }
  redirect('/cabinet/manage/erasure?done=1');
}

// ─────────────────────────── Учётные записи ─────────────────────────────────

/**
 * Завести учётную запись. Ссылку входа человек запрашивает сам: письмо со
 * ссылкой, отправленное без его действия, — рассылка, а не вход. Куратору
 * уходит приглашение без ссылки — с кнопкой «Открыть кабинет» (Э-03).
 */
export async function inviteUser(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  const role = String(form.get('role') ?? 'EXPERT') as Role;
  try {
    await createUser(actor, {
      email: String(form.get('email') ?? ''),
      fullName: String(form.get('fullName') ?? ''),
      role,
      position: String(form.get('position') ?? ''),
      degree: String(form.get('degree') ?? ''),
      specialization: String(form.get('specialization') ?? ''),
    });
  } catch (error) {
    const reason = reasonOf(error, 'Не удалось завести запись');
    redirect(await withError(`/cabinet/manage/users`, reason));
  }
  redirect(`/cabinet/manage/users?created=${role === 'EXPERT' ? 'curator' : '1'}`);
}

export async function changeUserRole(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  try {
    await setUserRole(actor, String(form.get('userId') ?? ''), String(form.get('role') ?? '') as Role);
  } catch (error) {
    const reason = reasonOf(error, 'Не удалось сменить роль');
    redirect(await withError(`/cabinet/manage/users`, reason));
  }
  redirect('/cabinet/manage/users');
}

export async function changeUserStatus(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  const status = String(form.get('status') ?? '') === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE';
  try {
    await setUserStatus(actor, String(form.get('userId') ?? ''), status);
  } catch (error) {
    const reason = reasonOf(error, 'Не удалось изменить состояние');
    redirect(await withError(`/cabinet/manage/users`, reason));
  }
  redirect('/cabinet/manage/users');
}

/** «Открыть клиенту вход» с карточки работы (требование М-03, решение Р-285). */
export async function openAccessForClient(
  _previous: AccessLinkState,
  form: FormData,
): Promise<AccessLinkState> {
  const actor = await actorOrRedirect();
  try {
    const issued = await openClientAccess(actor, String(form.get('projectId') ?? ''), await requestIp());
    const until = issued.expiresAt.toLocaleTimeString('ru-RU', {
      timeZone: 'Europe/Moscow',
      hour: '2-digit',
      minute: '2-digit',
    });
    return {
      link: issued.link,
      note:
        `Ссылка для «${issued.fullName}» действует до ${until} по Москве и срабатывает один раз. ` +
        'Передайте её клиенту тем каналом, которым с ним разговариваете; на экране входа он увидит свой адрес.',
      error: null,
    };
  } catch (error) {
    return { link: null, note: null, error: reasonOf(error, 'Не удалось открыть вход') };
  }
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
      error: reasonOf(error, 'Не удалось выдать ссылку'),
    };
  }
}

/** Регалии сотрудника (требование Т-11, решение Р-297). */
export async function updateRegalia(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  let failure: string | null = null;
  try {
    await saveRegalia(actor, String(form.get('userId') ?? ''), {
      degree: String(form.get('degree') ?? ''),
      specialization: String(form.get('specialization') ?? ''),
      specialtyCode: String(form.get('specialtyCode') ?? ''),
    });
  } catch (error) {
    failure = reasonOf(error, 'Не удалось сохранить регалии');
  }
  if (failure !== null) redirect(await withError('/cabinet/manage/users', failure));
  redirect('/cabinet/manage/users');
}

/**
 * «Сообщить руководителю» с экрана без договора поручения (требование
 * Э-12, решение Р-331).
 */
export async function requestNdaAction(): Promise<void> {
  const actor = await actorOrRedirect();
  let failure: string | null = null;
  try {
    await requestNda(actor);
  } catch (error) {
    failure = reasonOf(error, 'Не удалось отправить уведомление руководителю');
  }
  if (failure !== null) redirect(await withError(homeFor(actor), failure));
  redirect(homeFor(actor));
}

/** Профиль куратора — правит руководитель (требование Э-11). */
export async function updateCuratorProfile(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  const field = (name: string) => String(form.get(name) ?? '');
  let failure: string | null = null;
  try {
    await saveCuratorProfile(actor, field('userId'), {
      degree: field('degree'),
      academicTitle: field('academicTitle'),
      position: field('position'),
      specialtyCode: field('specialtyCode'),
      specialization: field('specialization'),
      university: field('university'),
      defaultPayout: field('defaultPayout'),
    });
  } catch (error) {
    failure = reasonOf(error, 'Не удалось сохранить профиль куратора');
  }
  if (failure !== null) redirect(await withError('/cabinet/manage/users', failure));
  redirect('/cabinet/manage/users');
}

export async function updateExpertNda(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  let failure: string | null = null;
  try {
    await signExpertNda(actor, String(form.get('userId') ?? ''), dateOrNull(form.get('signedOn')));
  } catch (error) {
    failure = reasonOf(error, 'Не удалось отметить договор');
  }
  if (failure !== null) redirect(await withError('/cabinet/manage/users', failure));
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
    const reason = reasonOf(error, 'Не удалось сохранить позицию');
    redirect(await withError(`/cabinet/manage/directory`, reason));
  }
  redirect('/cabinet/manage/directory');
}

export async function attachAlias(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  try {
    await addAlias(actor, String(form.get('serviceTypeId') ?? ''), String(form.get('alias') ?? ''));
  } catch (error) {
    const reason = reasonOf(error, 'Не удалось привязать написание');
    redirect(await withError(`/cabinet/manage/directory`, reason));
  }
  redirect('/cabinet/manage/directory');
}

export async function detachAlias(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  let failure: string | null = null;
  try {
    await removeAlias(actor, String(form.get('aliasId') ?? ''));
  } catch (error) {
    failure = reasonOf(error, 'Не удалось отвязать написание');
  }
  if (failure !== null) redirect(await withError('/cabinet/manage/directory', failure));
  redirect('/cabinet/manage/directory');
}

/** Закрыть дело руководителя «Не требуется» / «Проверено» (РК-12, Р-338). */
export async function closeHeadCheck(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  const code = String(form.get('code') ?? '');
  const back = `/cabinet/projects/${code}/payments`;
  let failure: string | null = null;
  try {
    await closeCheck(actor, String(form.get('checkId') ?? ''), String(form.get('note') ?? ''));
  } catch (error) {
    failure = reasonOf(error, 'Не удалось закрыть дело');
  }
  if (failure !== null) redirect(await withError(back, failure));
  redirect(back);
}

/** Срок реакции в рабочих днях (требование РК-05, решение Р-337). */
export async function saveReaction(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  const back = '/cabinet/manage/directory?tab=calendar';
  let failure: string | null = null;
  try {
    await saveReactionDays(actor, String(form.get('days') ?? ''));
  } catch (error) {
    failure = reasonOf(error, 'Не удалось сохранить срок реакции');
  }
  if (failure !== null) redirect(await withError(back, failure));
  redirect(back);
}

/** Внести расход месяца (требование РК-21, решение Р-353). */
export async function addExpenseAction(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  const back = '/cabinet/manage/finance/profit';
  let failure: string | null = null;
  try {
    await addExpense(actor, {
      month: String(form.get('month') ?? ''),
      categoryId: String(form.get('categoryId') ?? ''),
      amount: parseAmount(String(form.get('amount') ?? '')),
      serviceTypeId: String(form.get('serviceTypeId') ?? ''),
      note: String(form.get('note') ?? ''),
    });
  } catch (error) {
    failure = reasonOf(error, 'Не удалось внести расход');
  }
  if (failure !== null) {
    redirect(await withError(back, failure, { draft: fieldsOf(form, ['month', 'categoryId', 'amount', 'serviceTypeId', 'note']) }));
  }
  redirect(back);
}

/** Удалить ошибочно внесённый расход (РК-21, Р-353). */
export async function removeExpenseAction(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  const back = '/cabinet/manage/finance/profit';
  let failure: string | null = null;
  try {
    await removeExpense(actor, String(form.get('id') ?? ''));
  } catch (error) {
    failure = reasonOf(error, 'Не удалось удалить расход');
  }
  if (failure !== null) redirect(await withError(back, failure));
  redirect(back);
}

/** Поставить поручение (требование РК-19, решение Р-352). */
export async function createAssignmentAction(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  const back = '/cabinet/manage/assignments';
  let failure: string | null = null;
  try {
    await createAssignment(actor, {
      assigneeId: String(form.get('assigneeId') ?? ''),
      text: String(form.get('text') ?? ''),
      dueOn: dateOrNull(form.get('dueOn')),
      projectCode: String(form.get('project') ?? ''),
    });
  } catch (error) {
    failure = reasonOf(error, 'Не удалось поставить поручение');
  }
  if (failure !== null) {
    redirect(await withError(back, failure, { draft: fieldsOf(form, ['assigneeId', 'text', 'dueOn', 'project']) }));
  }
  redirect(`${back}?created=1`);
}

/** Перевести поручение: «в работе», «сделано», «отозвано» (РК-19, Р-352). */
export async function assignmentStatusAction(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  const back = String(form.get('back') ?? '') === 'manage' ? '/cabinet/manage/assignments' : '/cabinet/assignments';
  const raw = String(form.get('status') ?? '');
  let failure: string | null = null;
  try {
    if (raw !== 'IN_PROGRESS' && raw !== 'DONE' && raw !== 'WITHDRAWN') throw new Error('Неизвестное состояние поручения');
    await setAssignmentStatus(actor, String(form.get('id') ?? ''), raw);
  } catch (error) {
    failure = reasonOf(error, 'Не удалось изменить поручение');
  }
  if (failure !== null) redirect(await withError(back, failure));
  redirect(back);
}

/** Дата начала учёта и пороги уверенности (требование РК-16, решение Р-349). */
export async function saveAnalyticsSettings(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  const back = '/cabinet/manage/directory?tab=calendar';
  let failure: string | null = null;
  try {
    await saveAnalyticsSince(actor, String(form.get('since') ?? ''));
    await saveConfidenceThresholds(actor, String(form.get('thresholds') ?? ''));
  } catch (error) {
    failure = reasonOf(error, 'Не удалось сохранить настройки учёта');
  }
  if (failure !== null) redirect(await withError(back, failure));
  redirect(back);
}

/** Отметка рекомендации «сделано», «отложено» или снятие (РК-16, Р-349). */
export async function markRecommendationAction(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  const back = String(form.get('back') ?? '') === 'recommendations' ? '/cabinet/manage/recommendations' : '/cabinet/manage/recommendations/calendar';
  const raw = String(form.get('status') ?? '');
  let failure: string | null = null;
  try {
    await markRecommendation(
      actor,
      String(form.get('key') ?? ''),
      raw === 'DONE' || raw === 'POSTPONED' ? raw : null,
    );
  } catch (error) {
    failure = reasonOf(error, 'Не удалось отметить рекомендацию');
  }
  if (failure !== null) redirect(await withError(back, failure));
  redirect(back);
}

/** День производственного календаря (требование Т-15, решение Р-290). */
export async function saveCalendar(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  const back = '/cabinet/manage/directory?tab=calendar';
  let failure: string | null = null;
  try {
    await saveCalendarDay(actor, {
      day: dateOrNull(form.get('day')),
      workday: String(form.get('workday') ?? '') === 'yes',
      note: String(form.get('note') ?? ''),
    });
  } catch (error) {
    failure = reasonOf(error, 'Не удалось сохранить день календаря');
  }
  if (failure !== null) redirect(await withError(back, failure));
  redirect(back);
}

export async function dropCalendarDay(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  const back = '/cabinet/manage/directory?tab=calendar';
  let failure: string | null = null;
  try {
    await removeCalendarDay(actor, String(form.get('day') ?? ''));
  } catch (error) {
    failure = reasonOf(error, 'Не удалось снять день календаря');
  }
  if (failure !== null) redirect(await withError(back, failure));
  redirect(back);
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
    redirect(await withError(`/cabinet/projects/${code}/payments`, 'Файл не выбран'));
  }
  // С экрана оплат — только закрывающие документы (решение Р-244).
  const rawKind = String(form.get('kind') ?? 'OTHER');
  const kind = (['CONTRACT', 'INVOICE', 'ACT', 'OTHER'].includes(rawKind) ? rawKind : 'OTHER') as MaterialKind;
  const trancheId = String(form.get('trancheId') ?? '') || null;

  let failure: string | null = null;
  try {
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
  } catch (error) {
    failure = reasonOf(error, 'Не удалось приложить документ');
  }
  if (failure !== null) redirect(await withError(`/cabinet/projects/${code}/payments`, failure));
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
  // Адрес возврата — только внутри кабинета: значение поля формы иначе
  // уводило бы на чужой узел после загрузки (решение Р-246).
  const rawBack = String(form.get('back') ?? '');
  const back =
    rawBack.startsWith('/cabinet/') && !rawBack.startsWith('//') && !rawBack.includes('\\')
      ? rawBack
      : '/cabinet/projects';
  if (!(file instanceof File) || file.size === 0) {
    redirect(await withError(back, 'Файл не выбран'));
  }
  let failure: string | null = null;
  try {
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
  } catch (error) {
    failure = reasonOf(error, uploadFailedText(actor.role));
  }
  if (failure !== null) redirect(await withError(back, failure));
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
    const reason = reasonOf(error, 'Не удалось сохранить этап шаблона');
    redirect(await withError(`/cabinet/manage/directory`, reason));
  }
  redirect('/cabinet/manage/directory');
}

export async function dropStageTemplate(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  let failure: string | null = null;
  try {
    await removeStageTemplateItem(actor, String(form.get('id') ?? ''));
  } catch (error) {
    failure = reasonOf(error, 'Не удалось убрать этап шаблона');
  }
  if (failure !== null) redirect(await withError('/cabinet/manage/directory', failure));
  redirect('/cabinet/manage/directory');
}

/**
 * Отправить ещё раз письмо отказа — с карточки заявки (требование М-19,
 * решение Р-307). Отказ службы — у кнопки, а не общим экраном сбоя.
 */
export async function resendDeclineLetter(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  const leadId = String(form.get('leadId') ?? '');
  let failure: string | null = null;
  let resent = false;
  try {
    resent = await retryLeadLetter(actor, leadId, await requestIp());
  } catch (error) {
    failure = reasonOf(error, 'Не удалось отправить письмо ещё раз');
  }
  const path = `/cabinet/manage/leads/${leadId}`;
  if (failure !== null) redirect(await withError(path, failure, { slot: 'resend', anchor: 'decline' }));
  redirect(resent ? `${path}?resent=1#decline` : `${path}#decline`);
}

/** Повтор недоставленного приглашения куратору (улучшение УЭ-08, Р-385). */
export async function resendCuratorInvite(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  let failure: string | null = null;
  try {
    await retryCuratorInvite(actor, String(form.get('userId') ?? ''), await requestIp());
  } catch (error) {
    failure = reasonOf(error, 'Не удалось отправить приглашение ещё раз');
  }
  if (failure !== null) redirect(await withError('/cabinet/manage/users', failure));
  redirect('/cabinet/manage/users?saved=1');
}

/**
 * Вернуть недоставленное уведомление в очередь. Экран очереди служебный и
 * открыт только руководителю; право проверяет сама служба.
 */
export async function retryNotification(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  let failure: string | null = null;
  try {
    await retryFailed(actor, String(form.get('id') ?? ''), await requestIp());
  } catch (error) {
    failure = reasonOf(error, 'Не удалось вернуть уведомление в очередь');
  }
  if (failure !== null) redirect(await withError('/cabinet/manage/outbox', failure));
  redirect('/cabinet/manage/outbox');
}

/**
 * Разбор замечания с виджета (решение Р-403): критичность, состояние и что
 * сделано. Возврат — на ту же страницу перечня с тем же отбором; адрес
 * возврата приходит с формы и потому принимается только внутри экрана
 * замечаний. Право проверяет служба.
 */
export async function saveFeedbackReview(form: FormData): Promise<void> {
  const actor = await actorOrRedirect();
  const base = '/cabinet/manage/feedback';
  const raw = String(form.get('back') ?? '');
  const back = raw === base || raw.startsWith(`${base}?`) ? raw : base;
  let failure: string | null = null;
  try {
    await reviewFeedback(actor, String(form.get('id') ?? ''), {
      severity: String(form.get('severity') ?? ''),
      status: String(form.get('status') ?? ''),
      note: String(form.get('note') ?? ''),
    });
  } catch (error) {
    failure = reasonOf(error, 'Не удалось сохранить разбор');
  }
  if (failure !== null) redirect(await withError(back, failure));
  redirect(`${back}${back.includes('?') ? '&' : '?'}saved=1`);
}
