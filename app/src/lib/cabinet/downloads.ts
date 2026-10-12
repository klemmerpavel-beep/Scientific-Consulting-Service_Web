/**
 * Файлы раздела материалов: шаблоны документов (решение Р-554), чек-листы и
 * памятки (решение Р-555). Собираются при выдаче из того же кода, что
 * экраны: файл и экран не расходятся.
 *
 * Что кому выдаётся — решает этот модуль: незнакомый ключ и чужой файл
 * неразличимы, маршрут отвечает на оба «не найдено».
 */

import { can, type Actor } from './access.ts';
import { BRIEF_TEMPLATES } from './brief/templates.ts';
import { checklistsDocx, serviceChecklistsDocx } from './checklist-docs.ts';
import { CLIENT_MEMO, memoDocx } from './memos.ts';

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Адрес выдачи файла: `${DOWNLOAD_HREF}/{ключ}`. */
export const DOWNLOAD_HREF = '/cabinet/downloads';

export interface Download {
  /** Имя файла для человека и запасное латиницей (RFC 8187). */
  readonly file: string;
  readonly ascii: string;
  readonly type: string;
  readonly bytes: Buffer;
}

/** Файл по ключу для смотрящего; `null` — нет такого или не положен. */
export function download(actor: Actor, key: string): Download | null {
  if (actor.status !== 'ACTIVE') return null;
  // Шаблоны — всем ролям: клиент заполняет анкету и видит, что ему
  // пришлют на утверждение (решение владельца 12.10.2026).
  const template = BRIEF_TEMPLATES.find((item) => item.key === key);
  if (template !== undefined) return { file: template.file, ascii: template.ascii, type: template.type, bytes: template.build() };
  // Памятка по кабинету — клиенту и тем, кто передаёт её клиенту.
  if (key === CLIENT_MEMO.key) return { file: CLIENT_MEMO.file, ascii: CLIENT_MEMO.ascii, type: DOCX, bytes: memoDocx(CLIENT_MEMO) };
  // Чек-листы — порядок работы практики: только сотрудникам (ответ
  // владельца 12.10.2026), у каждого — свои.
  if (!can(actor, 'CHECKLIST_VIEW')) return null;
  if (key === 'chek-listy') return { file: 'Чек-листы.docx', ascii: 'chek-listy.docx', type: DOCX, bytes: checklistsDocx(actor) };
  if (key === 'chek-listy-po-vidam') {
    return { file: 'Чек-листы по видам работ.docx', ascii: 'chek-listy-po-vidam-rabot.docx', type: DOCX, bytes: serviceChecklistsDocx(actor) };
  }
  return null;
}
