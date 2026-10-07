import { prisma } from '../db.ts';
import { ensure, scopeLeads, type Actor } from './access.ts';
import { record } from './audit.ts';
import { isLeadSwitchStatus } from './lead-labels.ts';

/**
 * Работа с заявкой до решения (решение Р-270): состояние, правка сведений
 * и внутренние комментарии.
 *
 * Прежде у заявки было два исхода — одобрить или отклонить, — а всё, что
 * между ними («взяли в работу», «ответили, ждём ответа»), держалось в
 * голове или в мессенджере. Руководитель просил видеть это на экране и
 * менять одним нажатием.
 */
export class LeadWorkError extends Error {}

/** Заявка в пределах видимости действующего лица, иначе — отказ. */
async function visibleLead(actor: Actor, leadId: string) {
  ensure(actor, 'REQUEST_MODERATE');
  const scope = scopeLeads(actor);
  const lead =
    scope === null
      ? null
      : await prisma.lead.findFirst({
          where: { AND: [{ id: leadId }, scope] },
          select: { id: true, status: true, projectId: true, form: true },
        });
  if (lead === null) throw new LeadWorkError('Заявка не найдена');
  return lead;
}

/**
 * Сменить состояние плашкой. «Договор заключён» и «Отказ» так не ставятся:
 * у них есть последствия — работа и письмо заявителю, — и они ставятся
 * своими формами. Заявка, ставшая работой, своё состояние уже не меняет.
 */
export async function setLeadStatus(actor: Actor, leadId: string, status: string): Promise<void> {
  if (!isLeadSwitchStatus(status)) {
    throw new LeadWorkError('Это состояние ставится одобрением или отказом, а не плашкой');
  }
  const lead = await visibleLead(actor, leadId);
  if (lead.projectId !== null) {
    throw new LeadWorkError('Заявка уже стала работой: её состояние ведётся в карточке работы');
  }
  if (lead.status === status) return;
  // Давность состояния — для дела «Заявки в разборе» (М-06, Р-304).
  // Смена захватывает заявку в прочитанном состоянии и без работы: плашка,
  // нажатая во время одобрения или отказа, не возвращает отклонённую заявку
  // в разбор и не перекрашивает ставшую работой (решение Р-465).
  const { count } = await prisma.lead.updateMany({
    where: { id: lead.id, projectId: null, status: lead.status },
    data: { status, statusChangedAt: new Date() },
  });
  if (count === 0) throw new LeadWorkError('Состояние заявки уже изменилось: обновите страницу');
  await record(actor, {
    action: 'LEAD_STATUS_CHANGED',
    objectType: 'Lead',
    objectId: lead.id,
    payload: { from: lead.status, to: status },
  });
}

/** Поля заявки, которые правит руководитель или менеджер. */
export const LEAD_EDIT_FIELDS = [
  'name',
  'contact',
  'phone',
  'organization',
  'topic',
  'need',
  'deadline',
  'message',
] as const;
export type LeadEditField = (typeof LEAD_EDIT_FIELDS)[number];

const LIMITS: Record<LeadEditField, number> = {
  name: 200,
  contact: 200,
  phone: 60,
  organization: 300,
  topic: 500,
  need: 300,
  deadline: 120,
  message: 5000,
};

/**
 * Поправить сведения заявки: опечатку в имени, уточнённую тему, телефон,
 * продиктованный по звонку. В журнал уходят названия изменённых полей, а
 * не значения: журнал хранится дольше заявки и копией данных быть не
 * должен (решение Р-179). Отметки согласия не правятся — это журнал
 * согласия, а не сведения.
 */
export async function editLead(
  actor: Actor,
  leadId: string,
  values: Partial<Record<LeadEditField, string>>,
): Promise<void> {
  const lead = await visibleLead(actor, leadId);
  const current = await prisma.lead.findUniqueOrThrow({
    where: { id: lead.id },
    select: Object.fromEntries(LEAD_EDIT_FIELDS.map((field) => [field, true])) as Record<LeadEditField, true>,
  });
  const data: Partial<Record<LeadEditField, string | null>> = {};
  for (const field of LEAD_EDIT_FIELDS) {
    if (!(field in values)) continue;
    const raw = (values[field] ?? '').trim();
    if (raw.length > LIMITS[field]) throw new LeadWorkError(`Слишком длинное значение поля (${LIMITS[field]} знаков предел)`);
    const next = raw.length === 0 ? null : raw;
    if (field === 'contact' && next === null) throw new LeadWorkError('Контакт заявителя не может быть пустым');
    if (next !== (current as Record<string, string | null>)[field]) data[field] = next;
  }
  const changed = Object.keys(data);
  if (changed.length === 0) return;
  // Вид контакта — по новому значению: телефон, исправленный на почту,
  // иначе не получал писем, а почта, исправленная на телефон, уводила
  // письма в никуда (улучшение УМ-04, решение Р-374).
  const kind = typeof data.contact === 'string' ? contactKindOf(data.contact) : null;
  await prisma.lead.update({
    where: { id: lead.id },
    data: { ...(data as Record<string, string | null>), ...(kind === null ? {} : { contactKind: kind }) } as never,
  });
  await record(actor, {
    action: 'LEAD_EDITED',
    objectType: 'Lead',
    objectId: lead.id,
    payload: { fields: changed },
  });
}

/**
 * Вид контакта заявки по значению: адрес почты — `email`, иначе — `phone`.
 * Правило адреса — то же, что у письма заявителю (`leadAddress`).
 */
export function contactKindOf(contact: string): 'email' | 'phone' {
  return /^[^\s@]+@[^\s@]+$/u.test(contact.trim()) ? 'email' : 'phone';
}

/** Внутренний комментарий к заявке. Заявителю не показывается. */
export async function addLeadComment(actor: Actor, leadId: string, body: string): Promise<void> {
  const lead = await visibleLead(actor, leadId);
  const text = body.trim();
  if (text.length === 0) throw new LeadWorkError('Комментарий пуст');
  if (text.length > 4000) throw new LeadWorkError('Комментарий длиннее 4000 знаков');
  const comment = await prisma.leadComment.create({
    data: { leadId: lead.id, authorId: actor.id, body: text },
    select: { id: true },
  });
  await record(actor, {
    action: 'LEAD_COMMENTED',
    objectType: 'Lead',
    objectId: lead.id,
    payload: { commentId: comment.id },
  });
}
