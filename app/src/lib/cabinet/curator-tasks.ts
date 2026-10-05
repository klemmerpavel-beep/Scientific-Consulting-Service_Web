/**
 * Дела куратора — где ход за ним (требование Э-04, решение Р-329).
 *
 * Прежде «Назначенные работы» отвечали «Ход за вами в N работах» и
 * считали своим ходом и этап «Не начат», который запускает менеджер.
 * Теперь ответ — главное дело по ближайшему сроку и число остальных; у
 * каждого дела — экран, где оно закрывается действием куратора.
 *
 * Состав — после ответа ОЭ-1: дел переписки («вопрос клиента», «сообщение
 * менеджера») нет; «отклонено менеджером» — по версиям и замечаниям.
 *
 * Модуль чистый: данные собирает `curatorTasksData`, здесь — правила.
 */

import { clip } from './text-clip.ts';

/** Название в подписи сокращается: подпись — главная строка ответа экрана. */
const name = (text: string) => clip(text, 48);

export type CuratorTaskKind = 'STAGE' | 'CLIENT_RETURN' | 'MANAGER_RETURN' | 'VERSION_REJECTED' | 'COMMENT_REJECTED';

export interface CuratorTask {
  readonly kind: CuratorTaskKind;
  /** Подпись дела — главная строка ответа. */
  readonly label: string;
  /** Экран, где дело закрывается. */
  readonly href: string;
  /** Подпись кнопки на этот экран. */
  readonly action: string;
  /** Срок этапа, к которому относится дело; `null` — без срока. */
  readonly dueOn: Date | null;
  readonly code: string;
  /** Название работы: код на экране не выводится (Р-189). */
  readonly work: string;
}

export interface CuratorStage {
  readonly id: string;
  readonly title: string;
  readonly state: string;
  readonly dueOn: Date | null;
  readonly handedOverAt: Date | null;
  readonly handbackAt: Date | null;
  readonly returnedAt: Date | null;
}

export interface CuratorWork {
  readonly code: string;
  readonly title: string;
  readonly status: string;
  readonly stages: readonly CuratorStage[];
}

/** Своя версия куратора с решением менеджера. */
export interface OwnVersion {
  readonly versionId: string;
  readonly materialId: string;
  readonly materialTitle: string;
  readonly number: number;
  readonly status: string;
  readonly code: string;
  readonly stage: { readonly id: string; readonly dueOn: Date | null } | null;
}

/** Своё замечание куратора с решением менеджера. */
export interface OwnComment {
  readonly versionId: string;
  readonly createdAt: Date;
  readonly status: string;
  readonly materialTitle: string;
  readonly code: string;
  readonly stage: { readonly id: string; readonly dueOn: Date | null } | null;
}

/** Работа, в которой дела куратора есть: действующая и приостановленная (Д-4). */
const OPEN_WORK = new Set(['ACTIVE', 'PAUSED']);

const materialHref = (code: string, stage: { readonly id: string } | null) =>
  stage === null ? `/cabinet/projects/${code}/materials` : `/cabinet/stages/${stage.id}`;

/**
 * Дела куратора по ближайшему сроку этапа; дела без срока — в конце, в
 * порядке работ.
 *
 * - Этап «В работе», не сданный менеджеру, — одно дело: «Менеджер вернул
 *   этап» после возврата менеджером, «Клиент вернул этап с замечаниями»
 *   после возврата клиентом, иначе «Этап в работе». Закрывается сдачей
 *   этапа. «Не начат» делом не является: этап запускает менеджер.
 * - «Менеджер не опубликовал вашу версию» — последняя своя версия
 *   материала отклонена; закрывается новой версией того же материала.
 * - «Менеджер не опубликовал ваше замечание» — последнее своё замечание к
 *   версии отклонено; закрывается новым замечанием к той же версии.
 */
export function curatorTasks(
  works: readonly CuratorWork[],
  versions: readonly OwnVersion[] = [],
  comments: readonly OwnComment[] = [],
): CuratorTask[] {
  const open = new Set(works.filter((work) => OPEN_WORK.has(work.status)).map((work) => work.code));
  const titles = new Map(works.map((work) => [work.code, work.title]));
  const tasks: CuratorTask[] = [];

  for (const work of works) {
    if (!open.has(work.code)) continue;
    for (const stage of work.stages) {
      if (stage.state !== 'IN_PROGRESS' || stage.handedOverAt !== null) continue;
      const [kind, label] =
        stage.handbackAt !== null
          ? (['MANAGER_RETURN', `Менеджер вернул этап «${name(stage.title)}»`] as const)
          : stage.returnedAt !== null
            ? (['CLIENT_RETURN', `Клиент вернул этап «${name(stage.title)}» с замечаниями`] as const)
            : (['STAGE', `Этап «${name(stage.title)}» в работе`] as const);
      tasks.push({
        kind,
        label,
        href: `/cabinet/stages/${stage.id}`,
        action: 'Открыть этап',
        dueOn: stage.dueOn,
        code: work.code,
        work: work.title,
      });
    }
  }

  // Последняя своя версия каждого материала.
  const lastVersion = new Map<string, OwnVersion>();
  for (const version of versions) {
    const known = lastVersion.get(version.materialId);
    if (known === undefined || version.number > known.number) lastVersion.set(version.materialId, version);
  }
  for (const version of lastVersion.values()) {
    if (version.status !== 'REJECTED' || !open.has(version.code)) continue;
    tasks.push({
      kind: 'VERSION_REJECTED',
      label: `Менеджер не опубликовал вашу версию v${version.number}: «${name(version.materialTitle)}»`,
      href: materialHref(version.code, version.stage),
      action: version.stage === null ? 'Открыть материалы' : 'Открыть этап',
      dueOn: version.stage?.dueOn ?? null,
      code: version.code,
      work: titles.get(version.code) ?? '',
    });
  }

  // Последнее своё замечание к каждой версии.
  const lastComment = new Map<string, OwnComment>();
  for (const comment of comments) {
    const known = lastComment.get(comment.versionId);
    if (known === undefined || comment.createdAt > known.createdAt) lastComment.set(comment.versionId, comment);
  }
  for (const comment of lastComment.values()) {
    if (comment.status !== 'REJECTED' || !open.has(comment.code)) continue;
    tasks.push({
      kind: 'COMMENT_REJECTED',
      label: `Менеджер не опубликовал ваше замечание: «${name(comment.materialTitle)}»`,
      href: materialHref(comment.code, comment.stage),
      action: comment.stage === null ? 'Открыть материалы' : 'Открыть этап',
      dueOn: comment.stage?.dueOn ?? null,
      code: comment.code,
      work: titles.get(comment.code) ?? '',
    });
  }

  const order = new Map(works.map((work, index) => [work.code, index]));
  return tasks
    .map((task, index) => ({ task, index }))
    .sort((a, b) => {
      const ad = a.task.dueOn?.getTime() ?? Number.POSITIVE_INFINITY;
      const bd = b.task.dueOn?.getTime() ?? Number.POSITIVE_INFINITY;
      if (ad !== bd) return ad - bd;
      const aw = order.get(a.task.code) ?? 0;
      const bw = order.get(b.task.code) ?? 0;
      return aw !== bw ? aw - bw : a.index - b.index;
    })
    .map(({ task }) => task);
}
