import {
  BODY_MAX_BYTES,
  ExpertInputError,
  MIN_ELAPSED_MS,
  expertFiles,
  parseExpertForm,
  type ExpertApplicationInput,
  type ExpertFile,
} from './expert-application.ts';
import { clientIp } from './feedback-intake.ts';
import { RateLimiter } from './rate-limit.ts';

/**
 * Приём анкеты эксперта (решение Р-580): разбор запроса без базы, как приём
 * замечаний (`feedback-intake.ts`). Маршрут `/api/experts` связывает его со
 * службой записи; сам приём проверяется тестами на настоящем запросе.
 *
 * Адрес отправителя нужен только ключом ограничителя частоты в памяти
 * процесса; в базу он не пишется. Cookies и сессия не читаются.
 */

/** Пять анкет на адрес за час: анкету заполняют один раз, а не подряд. */
export const expertLimiter = new RateLimiter({ windowMs: 60 * 60_000, limit: 5, maxKeys: 5000 });

export interface ExpertSave {
  (input: ExpertApplicationInput, files: readonly ExpertFile[]): Promise<{ id: string }>;
}

export interface ExpertIntakeOptions {
  readonly limiter: RateLimiter;
  readonly save: ExpertSave;
  /** После записи — сигнал руководителю; сбой сигнала анкету не отменяет. */
  readonly after?: (id: string) => void;
  /** Часы сервера; подменяются в тестах. */
  readonly now?: () => number;
}

const RATE_LIMIT = 'Слишком много анкет с одного адреса. Попробуйте через час.';
const TOO_LARGE = 'Анкета с файлами больше 20 МБ — уменьшите файлы или пришлите ссылки на них.';
const UNREADABLE = 'Не удалось разобрать анкету. Обновите страницу и отправьте ещё раз.';
const SAVE_FAILED = 'Не удалось записать анкету. Попробуйте ещё раз через несколько минут.';

function answer(status: number, body: { ok: true } | { ok: false; error: string }): Response {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
}

/** Тело — не больше предела, даже без заголовка длины. `null` — превышен. */
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

export async function receiveExpertApplication(request: Request, options: ExpertIntakeOptions): Promise<Response> {
  if (options.limiter.hit(clientIp(request.headers))) return answer(429, { ok: false, error: RATE_LIMIT });

  // Размер — до разбора: разбор формы держит всё тело в памяти.
  const declared = Number(request.headers.get('content-length') ?? '');
  if (Number.isFinite(declared) && declared > BODY_MAX_BYTES) return answer(413, { ok: false, error: TOO_LARGE });
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

  // Ловушка и отсчёт времени — как в формах заявки: сработавшие молча
  // получают «принято» и не сохраняются.
  const trap = form.get('company_website');
  if (typeof trap === 'string' && trap.trim().length > 0) return answer(200, { ok: true });
  const elapsed = Number(String(form.get('elapsed') ?? ''));
  if (!Number.isFinite(elapsed) || elapsed < MIN_ELAPSED_MS) return answer(200, { ok: true });

  let saved: { id: string };
  try {
    const input = parseExpertForm(form);
    const files = await expertFiles(form);
    saved = await options.save(input, files);
  } catch (error) {
    if (error instanceof ExpertInputError) return answer(error.status, { ok: false, error: error.message });
    // В журнал сервера — вид сбоя, без содержимого анкеты.
    console.error('[experts] не удалось записать анкету', error instanceof Error ? error.message : error);
    return answer(503, { ok: false, error: SAVE_FAILED });
  }
  try {
    options.after?.(saved.id);
  } catch {
    // Сигнал — подсказка руководителю; анкета уже записана.
  }
  return answer(200, { ok: true });
}
