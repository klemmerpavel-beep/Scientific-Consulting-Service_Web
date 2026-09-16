'use server';

import { redirect } from 'next/navigation';

import { ensure } from '../../lib/cabinet/access';
import { requestLoginLink } from '../../lib/cabinet/auth';
import { addComment, moderateComment, uploadVersion } from '../../lib/cabinet/materials';
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
