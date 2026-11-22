/**
 * «Обновить из документа» на карточке работы (решение Р-561).
 *
 * Исходные данные на утверждение — тема, цель, задачи, план — приходят
 * документом. Экран сравнения показывает, что было и что станет; человек
 * отмечает, что перенести. Тема и суть задачи ложатся в карточку работы
 * правкой карточки (`planProjectEdit`) с её пределами; вуз и направление
 * дополняют только пустые поля карточки клиента — заполненное не
 * затирается. Документ прикладывается к выбранному этапу: клиент
 * утверждает его штатным согласованием этапа. Всё это и строки журнала —
 * одной транзакцией, файл версии — до неё (К-6, решение Р-1006).
 *
 * Несколько вариантов темы — выбор того, который выбрал клиент; выбор
 * пишется в журнал действий.
 */

import { prisma } from '../../db.ts';
import { ensure, ensureWorkOpen, scopeProjects, type Actor } from '../access.ts';
import { record } from '../audit.ts';
import { nextSlot, planUpload, writeVersion } from '../materials.ts';
import { planProjectEdit, writeProjectEdit } from '../projects.ts';
import { removeObjects, storage, undoObjectsOnFailure } from '../storage.ts';
import { loadBrief, stagedBrief } from './intake.ts';
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
 * Применить отмеченное и приложить документ. Тема и суть — правкой
 * карточки (`planProjectEdit`, `writeProjectEdit`): пределы и правила те
 * же, что у формы. Срок работы и название не трогаются. Документ ложится
 * на этап, если он выбран и открыт.
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
  // Порядок (К-6, решение Р-1006): правка карточки и загрузка документа
  // проверяются до записи; файл версии пишется первым; правка карточки,
  // дополнение карточки клиента, версия с письмами и все три строки
  // журнала — одной транзакцией; временный объект убирается после её
  // фиксации. Прежде правка, карточка клиента, версия и строка журнала
  // шли порознь: отказ загрузки оставлял карточку исправленной без
  // документа, а обрыв перед строкой — исправленную без строки журнала.
  const edit =
    topic === undefined && summary === undefined
      ? null
      : await planProjectEdit(actor, {
          projectId: project.id,
          title: project.title,
          topic: topic ?? project.topic,
          summary: summary ?? project.summary,
          dueOn: project.dueOn,
        });
  const doc = await stagedBrief(actor, input.ref, { projectId: project.id, stageId: stage?.id ?? null, title: 'Исходные данные работы' });
  const upload = doc === null ? null : await planUpload(actor, doc.upload);
  const slot = upload === null ? null : await nextSlot(upload);
  const store = storage();
  if (doc !== null && slot !== null) await store.put(slot.key, doc.upload.body, doc.upload.contentType);

  await undoObjectsOnFailure(store, slot === null ? [] : [slot.key], async () => {
    await prisma.$transaction(async (tx) => {
      if (edit !== null) await writeProjectEdit(tx, actor, edit);
      // Карточка клиента: только пустые поля, условием в запросе — гонка
      // двух правок не затрёт уже заполненное.
      for (const key of ['university', 'speciality'] as const) {
        const value = pick(key);
        if (value === undefined) continue;
        await tx.clientProfile.updateMany({ where: { id: project.clientId, [key]: null }, data: { [key]: value.slice(0, 300) } });
      }
      if (upload !== null && slot !== null) await writeVersion(tx, actor, upload, slot, ip);
      await record(actor, {
        action: 'BRIEF_APPLIED',
        objectType: 'Project',
        objectId: project.id,
        projectId: project.id,
        payload: {
          fields: chosen.map((row) => row.key),
          variant: input.variant === null ? null : (loaded.brief.variants[input.variant]?.label ?? null),
          stageId: stage?.id ?? null,
          attached: upload !== null,
        },
      }, tx);
    });
  });
  if (doc !== null) await removeObjects(store, [doc.key], 'временный объект документа не убран');
  return { applied: chosen.map((row) => row.key), attached: upload !== null };
}
