import {
  BODY_MAX_BYTES,
  FeedbackInputError,
  MIN_ELAPSED_MS,
  RATE_LIMIT_MESSAGE,
  SCREENSHOT_MAX_BYTES,
  SCREENSHOT_TOO_BIG,
} from './feedback.ts';
import { RateLimiter } from './rate-limit.ts';

/**
 * Приём замечания с виджета (решение Р-403): разбор запроса без базы.
 *
 * Маршрут `/api/feedback` только связывает этот приём со службой записи;
 * сам приём не знает ни базы, ни Next и потому проверяется тестами на
 * настоящем запросе.
 *
 * Чего здесь нет намеренно: cookies не читаются, сессия не ищется, строка
 * браузера не смотрится. Адрес отправителя нужен ровно для одного —
 * ключа ограничителя частоты в памяти процесса; в базу и в журнал сервера
 * он не попадает.
 */

/**
 * Десять замечаний на адрес за десять минут. У аудитории вуза один внешний
 * адрес на всех, но замечания — не заявки: десяти подряд с одного места
 * хватает с запасом, а больше — уже перебор.
 */
export const feedbackLimiter = new RateLimiter({ windowMs: 10 * 60_000, limit: 10, maxKeys: 5000 });

/** Адрес — тем же порядком, что у приёма заявок: X-Real-IP ставит наш nginx. */
export function clientIp(headers: Headers): string {
  const real = headers.get('x-real-ip')?.trim();
  if (real) return real;
  const fwd = headers.get('x-forwarded-for');
  if (fwd) {
    const hops = fwd.split(',').map((h) => h.trim()).filter(Boolean);
    if (hops.length) return hops[hops.length - 1]!;
  }
  return 'unknown';
}

export interface FeedbackSave {
  (input: { text: unknown; path: unknown; width: unknown; screenshot: Uint8Array | null }): Promise<unknown>;
}

export interface IntakeOptions {
  readonly enabled: boolean;
  readonly limiter: RateLimiter;
  readonly save: FeedbackSave;
  /** Часы сервера; подменяются в тестах. */
  readonly now?: () => number;
}

const TOO_LARGE = 'Замечание со снимком больше 6 МБ — уменьшите снимок или отправьте без него.';
const UNREADABLE = 'Не удалось разобрать запрос.';
const SAVE_FAILED = 'Не удалось записать замечание. Попробуйте ещё раз через несколько минут.';

function answer(status: number, body: { ok: true } | { ok: false; error: string }): Response {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
}

/**
 * Тело — не больше предела, даже без заголовка длины: тело кусками его не
 * несёт, и проверка одного заголовка пропустила бы что угодно. `null` —
 * предел превышен.
 */
async function readCapped(request: Request, max: number): Promise<Uint8Array | null> {
  if (request.body === null) return new Uint8Array(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.byteLength;
  }
  return out;
}

export async function receiveFeedback(request: Request, options: IntakeOptions): Promise<Response> {
  // Выключенный виджет — это отсутствующий адрес, а не отказ: снаружи не
  // видно, был ли он когда-то (решение Р-403).
  if (!options.enabled) return new Response('Не найдено', { status: 404 });

  if (options.limiter.hit(clientIp(request.headers))) {
    return answer(429, { ok: false, error: RATE_LIMIT_MESSAGE });
  }

  // Размер — до разбора: разбор формы держит всё тело в памяти.
  const declared = Number(request.headers.get('content-length') ?? '');
  if (Number.isFinite(declared) && declared > BODY_MAX_BYTES) {
    return answer(413, { ok: false, error: TOO_LARGE });
  }
  const body = await readCapped(request, BODY_MAX_BYTES);
  if (body === null) return answer(413, { ok: false, error: TOO_LARGE });

  let form: FormData;
  try {
    form = await new Response(body as BodyInit, {
      headers: { 'content-type': request.headers.get('content-type') ?? '' },
    }).formData();
  } catch {
    return answer(400, { ok: false, error: UNREADABLE });
  }

  // Ловушка и отсчёт времени — как в формах заявки. Сработавшие молча
  // получают «записано» и не сохраняются: робот не узнаёт, что пойман.
  const trap = form.get('company_website');
  if (typeof trap === 'string' && trap.trim().length > 0) return answer(200, { ok: true });
  const openedAt = Number(String(form.get('openedAt') ?? ''));
  const elapsed = (options.now ?? Date.now)() - openedAt;
  // Отрицательный срок — часы браузера впереди сервера, а не робот:
  // такое замечание принимается, как и замечание без отметки.
  if (Number.isFinite(openedAt) && openedAt > 0 && elapsed >= 0 && elapsed < MIN_ELAPSED_MS) {
    return answer(200, { ok: true });
  }

  const file = form.get('screenshot');
  let screenshot: Uint8Array | null = null;
  if (file !== null && typeof file !== 'string' && file.size > 0) {
    if (file.size > SCREENSHOT_MAX_BYTES) return answer(413, { ok: false, error: SCREENSHOT_TOO_BIG });
    screenshot = new Uint8Array(await file.arrayBuffer());
  }

  try {
    await options.save({
      text: form.get('text'),
      path: form.get('path'),
      width: form.get('width'),
      screenshot,
    });
  } catch (error) {
    if (error instanceof FeedbackInputError) return answer(error.status, { ok: false, error: error.message });
    // В журнал сервера — вид сбоя, без адреса и без содержимого запроса.
    console.error('[feedback] не удалось записать замечание', error instanceof Error ? error.message : error);
    return answer(503, { ok: false, error: SAVE_FAILED });
  }
  return answer(200, { ok: true });
}
