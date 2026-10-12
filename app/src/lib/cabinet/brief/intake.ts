/**
 * Загруженный документ между разбором и сохранением (решение Р-556).
 *
 * Разобранные значения не передаются через черновик формы: у него предел
 * 2800 байт и 300 знаков на поле (`flash-value.ts`), и суть задачи
 * обрезалась бы. Файл кладётся временным объектом хранилища под ключом
 * сотрудника, экран разбирает его при отрисовке, а при сохранении заказа
 * файл переезжает в материалы работы. Брошенные объекты удаляет
 * еженедельная чистка (`deploy/retention.sh`): старше суток.
 *
 * Чужой ключ не открывается: в ключе — идентификатор загрузившего, и
 * чужой `uuid` просто не находится.
 *
 * Тем же порядком клиент заполняет «Новую заявку» (решение Р-559): документ
 * лежит под его ключом, а при отправке становится вложением заявки.
 */

import { randomUUID } from 'node:crypto';

import { ensure, type Action, type Actor } from '../access.ts';
import { fileRefusal } from '../file-guard.ts';
import { uploadVersion } from '../materials.ts';
import { storage } from '../storage.ts';
import { parseBrief, type ParsedBrief } from './parse.ts';
import { BriefError, readBrief, type BriefFormat } from './read.ts';

const BRIEF_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

const TYPES: Readonly<Record<BriefFormat, string>> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

const briefKey = (actor: Actor, id: string, format: BriefFormat) => `briefs/${actor.id}/${id}.${format}`;

/**
 * Принять документ: проверка, разбор, временный объект. Возвращает ключ
 * для адреса экрана. Отказ — `BriefError` с причиной для человека.
 */
export async function stageBrief(actor: Actor, action: Action, name: string, bytes: Buffer): Promise<string> {
  ensure(actor, action);
  const refusal = fileRefusal(name, bytes);
  if (refusal !== null) throw new BriefError(refusal);
  const { format } = readBrief(bytes);
  const id = randomUUID();
  await storage().put(briefKey(actor, id, format), bytes, TYPES[format]);
  return `${id}.${format}`;
}

function split(ref: string): { id: string; format: BriefFormat } | null {
  const [id, format] = ref.split('.');
  if (id === undefined || !BRIEF_ID.test(id) || (format !== 'docx' && format !== 'xlsx')) return null;
  return { id, format };
}

/** Разобранный документ сотрудника; чужой или удалённый — `null`. */
export async function loadBrief(actor: Actor, action: Action, ref: string): Promise<{ brief: ParsedBrief; format: BriefFormat } | null> {
  ensure(actor, action);
  const parts = split(ref);
  if (parts === null) return null;
  let bytes: Buffer;
  try {
    bytes = await storage().get(briefKey(actor, parts.id, parts.format));
  } catch {
    return null;
  }
  try {
    return { brief: parseBrief(readBrief(bytes).lines), format: parts.format };
  } catch (error) {
    if (error instanceof BriefError) return null;
    throw error;
  }
}

/**
 * Перенести документ в материалы работы и убрать временный объект.
 * Отказ хранилища заказ не отменяет: документ остаётся у менеджера, а
 * причина уходит в журнал сервера (порядок вложений заявки, Р-237).
 */
export async function attachBrief(
  actor: Actor,
  ref: string,
  target: { projectId: string; stageId?: string | null; title: string },
  ip?: string | null,
): Promise<boolean> {
  const parts = split(ref);
  if (parts === null) return false;
  const key = briefKey(actor, parts.id, parts.format);
  let bytes: Buffer;
  try {
    bytes = await storage().get(key);
  } catch {
    return false;
  }
  await uploadVersion(
    actor,
    {
      projectId: target.projectId,
      stageId: target.stageId ?? null,
      title: target.title,
      originalName: `${target.title}.${parts.format}`,
      contentType: TYPES[parts.format],
      body: bytes,
    },
    ip,
  );
  await storage().remove(key).catch(() => undefined);
  return true;
}

/**
 * Документ как вложение заявки клиента (решение Р-559): байты и имя файла.
 * Объект остаётся на месте до `dropBrief`: заявка может не пройти
 * проверку, и документ нужен на повторной отправке. Нет объекта — `null`.
 */
export async function briefAttachment(
  actor: Actor,
  action: Action,
  ref: string,
  title: string,
): Promise<{ originalName: string; contentType: string; body: Buffer } | null> {
  ensure(actor, action);
  const parts = split(ref);
  if (parts === null) return null;
  try {
    const body = await storage().get(briefKey(actor, parts.id, parts.format));
    return { originalName: `${title}.${parts.format}`, contentType: TYPES[parts.format], body };
  } catch {
    return null;
  }
}

/** Убрать временный объект после того, как документ лёг вложением. */
export async function dropBrief(actor: Actor, ref: string): Promise<void> {
  const parts = split(ref);
  if (parts === null) return;
  await storage().remove(briefKey(actor, parts.id, parts.format)).catch(() => undefined);
}
