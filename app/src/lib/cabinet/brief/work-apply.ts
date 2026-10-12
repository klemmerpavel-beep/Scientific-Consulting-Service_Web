/**
 * «Обновить из документа» на карточке работы (решение Р-560).
 *
 * Исходные данные на утверждение — тема, цель, задачи, план — приходят
 * документом. Экран сравнения показывает, что было и что станет; человек
 * отмечает, что перенести. Тема и суть задачи ложатся в карточку работы
 * через `editProject` с его пределами; вуз и направление дополняют только
 * пустые поля карточки клиента — заполненное не затирается. Документ
 * прикладывается к выбранному этапу: клиент утверждает его штатным
 * согласованием этапа.
 *
 * Несколько вариантов темы — выбор того, который выбрал клиент; выбор
 * пишется в журнал действий.
 */

import { prisma } from '../../db.ts';
import { ensure, ensureWorkOpen, scopeProjects, type Actor } from '../access.ts';
import { record } from '../audit.ts';
import { editProject } from '../projects.ts';
import { attachBrief, loadBrief } from './intake.ts';
import { variantFields, workBriefRows, type WorkBriefKey } from './work-rows.ts';

export type { WorkBriefKey } from './work-rows.ts';

const PROJECT_SELECT = {
  id: true,
  code: true,
  title: true,
  topic: true,
  summary: true,
  dueOn: true,
  status: true,
  clientId: true,
  managerId: true,
  expertId: true,
  client: { select: { university: true, speciality: true } },
  stages: { orderBy: { position: 'asc' as const }, select: { id: true, title: true, state: true } },
} as const;

async function workFor(actor: Actor, where: { code: string } | { id: string }) {
  const scope = scopeProjects(actor);
  if (scope === null) return null;
  const project = await prisma.project.findFirst({ where: { ...where, ...scope }, select: PROJECT_SELECT });
  if (project === null) return null;
  ensure(actor, 'PROJECT_EDIT', project);
  return project;
}

/** Данные экрана сравнения; `null` — работы или документа нет. */
export async function previewWorkBrief(actor: Actor, code: string, ref: string | null, variant: number | null) {
  const project = await workFor(actor, { code });
  if (project === null) return null;
  const stageDefault = project.stages.find((stage) => stage.state !== 'DONE')?.id ?? null;
  if (ref === null) return { project, loaded: null, rows: [], stageDefault };
  const loaded = await loadBrief(actor, 'REQUEST_MODERATE', ref);
  if (loaded === null) return { project, loaded: null, rows: [], stageDefault };
  const fields = variantFields(loaded.brief, variant);
  const rows = workBriefRows(
    { topic: project.topic, summary: project.summary, university: project.client.university, speciality: project.client.speciality },
    fields,
  );
  return { project, loaded, rows, stageDefault };
}

/**
 * Применить отмеченное и приложить документ. Тема и суть — через
 * `editProject`: пределы и правила карточки те же. Срок работы и название
 * не трогаются. Документ ложится на этап, если он выбран и открыт.
 */
export async function applyWorkBrief(
  actor: Actor,
  input: { projectId: string; ref: string; variant: number | null; apply: readonly WorkBriefKey[]; stageId: string | null },
  ip?: string | null,
): Promise<{ applied: WorkBriefKey[]; attached: boolean }> {
  const project = await workFor(actor, { id: input.projectId });
  if (project === null) throw new Error('Работа не найдена');
  ensureWorkOpen(project.status);
  const loaded = await loadBrief(actor, 'REQUEST_MODERATE', input.ref);
  if (loaded === null) throw new Error('Документ не найден: загрузите его снова');
  if (loaded.brief.variants.length > 0 && (input.variant === null || loaded.brief.variants[input.variant] === undefined)) {
    throw new Error('В документе несколько вариантов темы: выберите тот, который выбрал клиент');
  }
  const rows = workBriefRows(
    { topic: project.topic, summary: project.summary, university: project.client.university, speciality: project.client.speciality },
    variantFields(loaded.brief, input.variant),
  );
  const chosen = rows.filter((row) => input.apply.includes(row.key) && (row.mode === 'replace' || row.mode === 'fill'));
  // Этап проверяется до правок: отказ не оставляет карточку наполовину
  // обновлённой.
  const stage = input.stageId === null ? null : project.stages.find((item) => item.id === input.stageId && item.state !== 'DONE');
  if (input.stageId !== null && stage === undefined) throw new Error('Этап закрыт или не найден: выберите открытый этап');
  const pick = (key: WorkBriefKey) => chosen.find((row) => row.key === key)?.after;

  const topic = pick('topic');
  const summary = pick('summary');
  if (topic !== undefined || summary !== undefined) {
    await editProject(actor, {
      projectId: project.id,
      title: project.title,
      topic: topic ?? project.topic,
      summary: summary ?? project.summary,
      dueOn: project.dueOn,
    });
  }
  // Карточка клиента: только пустые поля, условием в запросе — гонка двух
  // правок не затрёт уже заполненное.
  for (const key of ['university', 'speciality'] as const) {
    const value = pick(key);
    if (value === undefined) continue;
    await prisma.clientProfile.updateMany({ where: { id: project.clientId, [key]: null }, data: { [key]: value.slice(0, 300) } });
  }

  const attached = await attachBrief(actor, input.ref, { projectId: project.id, stageId: stage?.id ?? null, title: 'Исходные данные работы' }, ip);

  await record(actor, {
    action: 'BRIEF_APPLIED',
    objectType: 'Project',
    objectId: project.id,
    projectId: project.id,
    payload: {
      fields: chosen.map((row) => row.key),
      variant: input.variant === null ? null : (loaded.brief.variants[input.variant]?.label ?? null),
      stageId: stage?.id ?? null,
      attached,
    },
  });
  return { applied: chosen.map((row) => row.key), attached };
}
