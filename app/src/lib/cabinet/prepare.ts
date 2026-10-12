/**
 * «Что подготовить» по работе (решение Р-563): перечень вида работы и
 * отметка «приложено» по материалам, которые смотрящий видит.
 *
 * Материалы берутся выборкой экрана материалов: она уже сужает их по
 * матрице прав, и клиент не узнает о материале куратора, ждущем
 * публикации, по отметке у пункта.
 */

import { prisma } from '../db.ts';
import { can, scopeProjects, type Actor } from './access.ts';
import { prepareList, prepareOpen, prepareStatus, titleKey, type PrepareItem } from './prepare-lists.ts';
import { projectMaterials } from './queries.ts';

export interface PrepareRow extends PrepareItem {
  readonly attached: boolean;
  /** Материал с названием пункта: «Приложить» добавляет к нему версию. */
  readonly materialId: string | null;
}

/** Экран «Что подготовить»; `null` — работы нет или она не видна. */
export async function prepareView(actor: Actor, code: string) {
  const scope = scopeProjects(actor);
  if (scope === null) return null;
  const project = await projectMaterials(actor, code);
  if (project === null) return null;
  const type = await prisma.project.findFirst({
    where: { id: project.id, ...scope },
    select: { serviceType: { select: { code: true, name: true } } },
  });
  if (type === null) return null;
  const list = prepareList(type.serviceType.code);
  // Удалённые материалы видит только руководитель (`scopeMaterials`), и
  // приложенным пункт они не делают.
  const materials = project.materials.filter((material) => material.deletedAt === null);
  // Выборка — от новых к старым: у пункта — последний приложенный материал.
  const newest = new Map<string, string>();
  for (const material of materials) if (!newest.has(titleKey(material.title))) newest.set(titleKey(material.title), material.id);
  const status = list === null ? null : prepareStatus(list, materials);
  const rows: PrepareRow[] =
    list === null
      ? []
      : list.items.map((item) => ({
          ...item,
          attached: status!.attached.has(item.key),
          materialId: newest.get(titleKey(item.title)) ?? null,
        }));
  const open = prepareOpen(project);
  return {
    project,
    serviceName: type.serviceType.name,
    list,
    rows,
    done: status?.done ?? 0,
    total: status?.total ?? 0,
    open,
    // Прикладывает клиент: перечень — его. Сотрудник видит отметки и
    // загружает материалы своим порядком.
    mayAttach:
      open &&
      actor.role === 'CLIENT' &&
      can(actor, 'MATERIAL_UPLOAD', { id: project.id, clientId: project.clientId, managerId: project.managerId, expertId: project.expertId }),
  };
}
