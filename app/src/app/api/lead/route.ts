import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../lib/db';
import { deliver } from '../../../lib/notify';
import { CONSENT_VERSION, leadSchema, looksAutomated } from '../../../lib/lead-schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Приём заявки.
 *
 * Порядок намеренный: сначала сохранить, потом доставлять. Заявка, которая
 * записана в базу, но не ушла в Telegram, — это задержка ответа. Заявка,
 * которая ушла в Telegram, но не записана, — это потерянный клиент и
 * отсутствующий журнал согласий.
 */

/**
 * Ограничение частоты по адресу: защита от перебора, не от нагрузки.
 * Окно намеренно широкое: у целой аудитории вуза один внешний адрес на всех,
 * и жёсткий лимит отрезал бы живых заявителей вместе с роботами. Роботов
 * ловят ловушка в форме и отсчёт времени, а не этот счётчик.
 */
const RATE_WINDOW_MS = 5 * 60_000;
const RATE_LIMIT = 15;
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();   // не даём карте расти без предела
  return recent.length > RATE_LIMIT;
}

/**
 * Адрес заявителя. Порядок источников намеренный.
 *
 * X-Forwarded-For приходит от клиента и лишь дополняется прокси, поэтому
 * первый элемент списка задаёт сам отправитель: по нему легко обойти
 * ограничение частоты и записать в журнал согласий чужой адрес. X-Real-IP
 * наш nginx выставляет из $remote_addr и затирает клиентское значение —
 * ему верить можно. Если его нет, берём последний элемент списка: его
 * дописал ближайший прокси, и подделать его клиент не может.
 */
function clientIp(req: NextRequest): string {
  const real = req.headers.get('x-real-ip')?.trim();
  if (real) return real;
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) {
    const hops = fwd.split(',').map((h) => h.trim()).filter(Boolean);
    if (hops.length) return hops[hops.length - 1];
  }
  return 'unknown';
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req);

  if (rateLimited(ip)) {
    return NextResponse.json(
      { ok: false, message: 'Слишком много попыток подряд. Подождите минуту и отправьте снова.' },
      { status: 429 },
    );
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: 'Не удалось разобрать запрос.' }, { status: 400 });
  }

  const parsed = leadSchema.safeParse(raw);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? 'form');
      if (!errors[key]) errors[key] = issue.message;
    }
    return NextResponse.json(
      { ok: false, message: 'Проверьте отмеченные поля.', errors },
      { status: 422 },
    );
  }

  const lead = parsed.data;
  const automated = looksAutomated(lead);

  let id: string;
  try {
    const saved = await prisma.lead.create({
      data: {
        source: lead.source,
        form: lead.form,
        name: lead.name || null,
        contactKind: lead.contactKind,
        contact: lead.contact,
        organization: lead.organization || null,
        topic: lead.topic || null,
        speciality: lead.speciality || null,
        need: lead.need || null,
        deadline: lead.deadline || null,
        direction: lead.direction || null,
        message: lead.message || null,
        consentGiven: lead.consent,
        consentVersion: CONSENT_VERSION,
        termsAccepted: lead.terms,
        marketingOptIn: lead.marketing,
        ip,
        userAgent: req.headers.get('user-agent')?.slice(0, 512) ?? null,
        status: automated ? 'SPAM' : 'NEW',
        notes: automated ? `Признак автоматической отправки: ${automated}` : null,
      },
      select: { id: true },
    });
    id = saved.id;
  } catch (e) {
    // База — единственное место, отказ которого обязан быть виден заявителю:
    // без записи нет ни заявки, ни журнала согласия.
    console.error('[lead] не удалось сохранить заявку', e);
    return NextResponse.json(
      {
        ok: false,
        message:
          'Не удалось сохранить заявку. Напишите нам на почту или позвоните — ответим тем же порядком.',
      },
      { status: 503 },
    );
  }

  // Помеченные как автоматические не тревожат ответственного, но лежат в базе
  if (!automated) {
    const results = await deliver(lead, id);
    await prisma.delivery
      .createMany({
        data: results.map((r) => ({ leadId: id, channel: r.channel, ok: r.ok, error: r.error ?? null })),
      })
      .catch((e) => console.error('[lead] не удалось записать журнал доставки', e));
  }

  return NextResponse.json({ ok: true, id });
}
