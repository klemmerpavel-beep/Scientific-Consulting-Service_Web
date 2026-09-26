import { prisma } from '../db.ts';
import { leadSourceLabel, leadStatusLabel } from '../cabinet/lead-labels.ts';
import { yearlyRows } from '../cabinet/finance-years.ts';
import type { Actor } from '../cabinet/access.ts';
import { STATUS_LABEL as TRANCHE_LABEL } from '../cabinet/money.ts';
import { stageStateLabel } from '../cabinet/stage-state.ts';
import { materialFolders, versionPath } from './paths.ts';
import { csv, rub } from './table.ts';

/**
 * Таблицы реестров для зеркала на Диске.
 *
 * Зачем таблицы, если есть кабинет: кабинет отвечает на вопрос «что сейчас»,
 * таблица — на вопрос «сведи и посчитай». Руководитель открывает её на
 * телефоне, сортирует по своему и складывает столбцы; заводить ради этого
 * отчёты в кабинете значило бы писать вторую таблицу поверх первой.
 *
 * Все таблицы собираются целиком и перезаписываются: файл на Диске — всегда
 * полный список, а не приращение. Приращение требовало бы помнить, чем
 * кончился прошлый прогон, и умело бы расходиться с базой.
 */

/** Дата без времени: в таблице сортируют по дню, час там лишний. */
function day(value: Date | null | undefined): string {
  return value === null || value === undefined ? '' : value.toISOString().slice(0, 10);
}

function moment(value: Date | null | undefined): string {
  return value === null || value === undefined ? '' : value.toISOString().slice(0, 16).replace('T', ' ');
}

/**
 * Названия состояний работы. Перечень короткий и нигде больше не нужен:
 * в кабинете состояние работы показывается отметкой, а не словом.
 */
const PROJECT_STATUS: Record<string, string> = {
  ACTIVE: 'в работе',
  PAUSED: 'приостановлена',
  COMPLETED: 'завершена',
  CANCELLED: 'отменена',
};

export interface Table {
  readonly name: string;
  readonly body: string;
  readonly rows: number;
}

function table(name: string, head: readonly string[], rows: readonly (readonly unknown[])[]): Table {
  return { name, body: csv(head, rows), rows: rows.length };
}

export async function leadsTable(): Promise<Table> {
  const rows = await prisma.lead.findMany({
    where: { NOT: { form: 'review' } },
    orderBy: { createdAt: 'desc' },
    include: { project: { select: { code: true } } },
  });
  return table(
    'zayavki.csv',
    ['Дата', 'Страница', 'Форма', 'Имя', 'Контакт', 'Организация', 'Тема', 'Что нужно',
     'Срок', 'Сообщение', 'Согласие', 'Рассылка', 'Состояние', 'Работа', 'Идентификатор'],
    rows.map((r) => [
      moment(r.createdAt), leadSourceLabel(r.source), r.form, r.name ?? '', r.contact,
      r.organization ?? '', r.topic ?? '', r.need ?? '', r.deadline ?? '', r.message ?? '',
      r.consentGiven ? 'да' : 'нет', r.marketingOptIn ? 'да' : 'нет',
      leadStatusLabel(r.status), r.project?.code ?? '', r.id,
    ]),
  );
}

export async function reviewsTable(): Promise<Table> {
  const rows = await prisma.lead.findMany({
    where: { form: 'review' },
    orderBy: { createdAt: 'desc' },
  });
  return table(
    'otzyvy.csv',
    ['Дата', 'Страница', 'Кто', 'Отзыв', 'Можно публиковать', 'Состояние', 'Идентификатор'],
    rows.map((r) => [
      moment(r.createdAt), leadSourceLabel(r.source), r.name ?? '', r.message ?? '',
      r.publishAllowed ? 'да' : 'нет', leadStatusLabel(r.status), r.id,
    ]),
  );
}

export async function projectsTable(): Promise<Table> {
  const rows = await prisma.project.findMany({
    orderBy: { code: 'desc' },
    include: {
      client: { select: { fullName: true } },
      serviceType: { select: { name: true } },
      manager: { select: { fullName: true } },
      expert: { select: { fullName: true } },
      contract: { select: { number: true, totalAmount: true, tranches: true } },
      // Изъятые материалы не считаются: в кабинете их нет, и в отчёте
      // столбец должен сходиться с тем, что человек видит на экране.
      _count: { select: { stages: true, materials: { where: { deletedAt: null } } } },
    },
  });
  return table(
    'raboty.csv',
    ['Код', 'Название', 'Тема', 'Клиент', 'Тип сопровождения', 'Куратор', 'Исполнитель',
     'Состояние', 'Начата', 'Срок', 'Закрыта', 'Договор', 'Сумма договора', 'Оплачено',
     'Этапов', 'Материалов'],
    rows.map((p) => {
      const paid = (p.contract?.tranches ?? [])
        .filter((t) => t.status === 'PAID')
        .reduce((sum, t) => sum + t.amount, 0n);
      return [
        p.code, p.title, p.topic ?? '', p.client.fullName, p.serviceType.name,
        p.manager.fullName, p.expert?.fullName ?? p.expertNameRaw ?? '',
        PROJECT_STATUS[p.status] ?? p.status, day(p.startedOn), day(p.dueOn), day(p.closedOn),
        p.contract?.number ?? '', rub(p.contract?.totalAmount ?? null), rub(paid),
        p._count.stages, p._count.materials,
      ];
    }),
  );
}

export async function stagesTable(): Promise<Table> {
  const rows = await prisma.stage.findMany({
    orderBy: [{ project: { code: 'desc' } }, { position: 'asc' }],
    include: {
      project: { select: { code: true } },
      expert: { select: { fullName: true } },
    },
  });
  return table(
    'etapy.csv',
    ['Работа', '№', 'Этап', 'Состояние', 'Срок', 'Исполнитель', 'Начат', 'Завершён'],
    rows.map((s) => [
      s.project.code, s.position, s.title, stageStateLabel(s.state),
      day(s.dueOn), s.expert?.fullName ?? '', day(s.startedAt), day(s.completedAt),
    ]),
  );
}

export async function paymentsTable(): Promise<Table> {
  const rows = await prisma.tranche.findMany({
    orderBy: [{ plannedDate: 'asc' }],
    include: {
      contract: {
        select: {
          number: true,
          signedOn: true,
          totalAmount: true,
          project: { select: { code: true, client: { select: { fullName: true } } } },
        },
      },
    },
  });
  return table(
    'oplaty.csv',
    ['Работа', 'Клиент', 'Договор', 'Подписан', 'Сумма договора', 'Поступление', 'Сумма',
     'Плановая дата', 'Состояние', 'Оплачено'],
    rows.map((t) => [
      t.contract.project.code, t.contract.project.client.fullName, t.contract.number,
      day(t.contract.signedOn), rub(t.contract.totalAmount), t.title, rub(t.amount),
      day(t.plannedDate), TRANCHE_LABEL[t.status] ?? t.status, day(t.paidOn),
    ]),
  );
}

/**
 * Итоги по годам — те же величины, что на экране кабинета, включая
 * расхождение введённого с посчитанным. Считает их модуль кабинета, а не эта
 * выгрузка: две независимые арифметики над одними деньгами разошлись бы, и
 * неизвестно было бы, какой верить.
 */
export async function yearsTable(actor: Actor): Promise<Table> {
  const summary = await yearlyRows(actor);
  return table(
    'itogi-po-godam.csv',
    ['Год', 'Выручка (введено)', 'Затраты (введено)', 'Прибыль (введено)',
     'Выручка (посчитано)', 'Затраты (посчитано)', 'Прибыль (посчитано)', 'Заказов',
     'Расхождение по выручке', 'Примечание'],
    summary.rows.map((r) => [
      r.year, rub(r.entered?.revenue ?? null), rub(r.entered?.costs ?? null),
      rub(r.entered?.profit ?? null), rub(r.counted.revenue), rub(r.counted.costs),
      rub(r.counted.profit), r.counted.orders, rub(r.revenueGap), r.entered?.note ?? '',
    ]),
  );
}

export interface MaterialFile {
  readonly storageKey: string;
  readonly path: string;
  readonly sha256: string;
  readonly sizeBytes: number;
}

/**
 * Перечень версий материалов, которым место в зеркале, и их пути.
 *
 * Мягко удалённые материалы исключены: в кабинете их не видно, и в зеркале
 * им делать нечего. Именно поэтому зеркало умеет удалять — изъятие материала
 * на сервере должно убирать его и с Диска, иначе обезличивание субъекта
 * (ст. 21 152-ФЗ) оставляло бы копию, о которой никто не помнит.
 *
 * Изъятые версии исключены тоже: объекта у них больше нет, и зеркало,
 * пытавшееся выложить их под новым именем, каждый час кончалось ошибкой
 * (решение Р-234).
 */
export async function materialFiles(): Promise<MaterialFile[]> {
  const versions = await prisma.materialVersion.findMany({
    where: { material: { deletedAt: null }, purgedAt: null },
    include: {
      material: {
        select: { id: true, createdAt: true, title: true, project: { select: { code: true } } },
      },
    },
  });
  const folders = materialFolders(versions.map((v) => v.material));
  return versions.map((v) => ({
    storageKey: v.storageKey,
    path: versionPath(v.material.project.code, folders.get(v.material.id)!, v.number, v.originalName),
    sha256: v.sha256,
    sizeBytes: Number(v.sizeBytes),
  }));
}

/**
 * Опись материалов таблицей: что лежит в зеркале, где и какого размера.
 * По ней ищут файл, не обходя папки, и по ней же видно, что зеркало полное.
 */
export async function materialsTable(files: readonly MaterialFile[]): Promise<Table> {
  const versions = await prisma.materialVersion.findMany({
    where: { material: { deletedAt: null } },
    include: {
      uploadedBy: { select: { fullName: true } },
      material: { select: { title: true, project: { select: { code: true } } } },
    },
    orderBy: { uploadedAt: 'desc' },
  });
  const pathByKey = new Map(files.map((f) => [f.storageKey, f.path]));
  return table(
    'materialy.csv',
    ['Работа', 'Материал', 'Версия', 'Файл', 'Размер, байт', 'Загружен', 'Кем', 'Путь в зеркале'],
    versions.map((v) => [
      v.material.project.code, v.material.title, v.number, v.originalName,
      String(v.sizeBytes), moment(v.uploadedAt), v.uploadedBy?.fullName ?? '',
      pathByKey.get(v.storageKey) ?? '',
    ]),
  );
}
