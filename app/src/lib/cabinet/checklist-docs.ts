/**
 * Чек-листы и памятки файлом Word (указание владельца 12.10.2026, решение
 * Р-559): то же содержание, что на экранах, собранное тем же кодом.
 * Отмечать в файле — ручкой: квадрат перед каждым шагом.
 */

import type { Actor } from './access.ts';
import { CHECKLIST_GROUPS, audienceLabel, checklistsFor, stepText } from './checklists.ts';
import { docx, type DocBlock } from './docx.ts';
import { SERVICE_PHASES, serviceChecklistsFor } from './service-checklists.ts';

const ROLE_TITLE = { EXPERT: 'куратора', MANAGER: 'менеджера', HEAD: 'практики' } as const;

/** Процессные чек-листы смотрящего: свои, у руководителя — все с адресатом. */
export function checklistsDocx(actor: Actor): Buffer {
  const lists = checklistsFor(actor);
  const head = actor.role === 'HEAD';
  const title = `Чек-листы ${ROLE_TITLE[actor.role as keyof typeof ROLE_TITLE] ?? ''}`.trim();
  const blocks: DocBlock[] = [
    { kind: 'title', text: title },
    { kind: 'paragraph', text: 'Порядок основных дел по шагам. Названия кнопок и экранов — как в кабинете.', muted: true },
  ];
  for (const group of CHECKLIST_GROUPS) {
    const own = lists.filter((list) => list.group === group.key);
    if (own.length === 0) continue;
    blocks.push({ kind: 'heading', text: group.title });
    for (const list of own) {
      blocks.push({ kind: 'heading', text: head ? `${list.title} — ${audienceLabel(list.roles)}` : list.title });
      blocks.push({ kind: 'paragraph', text: `Когда: ${list.when}`, muted: true });
      for (const step of list.steps) blocks.push({ kind: 'check', text: stepText(step) });
    }
  }
  return docx(title, blocks);
}

/** Чек-листы по видам работ: старт, по ходу, сдача. */
export function serviceChecklistsDocx(actor: Actor): Buffer {
  const blocks: DocBlock[] = [
    { kind: 'title', text: 'Чек-листы по видам работ' },
    { kind: 'paragraph', text: 'Что проверить на старте, по ходу и при сдаче — по виду сопровождения.', muted: true },
  ];
  for (const list of serviceChecklistsFor(actor)) {
    blocks.push({ kind: 'heading', text: list.title });
    blocks.push({ kind: 'paragraph', text: `Когда: ${list.when}`, muted: true });
    for (const phase of SERVICE_PHASES) {
      const steps = list.steps.filter((step) => step.phase === phase.key);
      if (steps.length === 0) continue;
      blocks.push({ kind: 'paragraph', text: `${phase.title}:` });
      for (const step of steps) blocks.push({ kind: 'check', text: step.text });
    }
  }
  return docx('Чек-листы по видам работ', blocks);
}
