import { createHash, timingSafeEqual } from 'node:crypto';

import { mskMoment } from './disk/table.ts';
import {
  AREA_LABEL,
  NOTE_MAX,
  SEVERITY_LABEL,
  STATUS_LABEL,
  isSeverity,
  isStatus,
  type FeedbackArea,
  type FeedbackSeverity,
  type FeedbackStatus,
} from './feedback.ts';
import { clientIp } from './feedback-intake.ts';
import { RateLimiter } from './rate-limit.ts';

/**
 * Выгрузка и разбор замечаний по ключу (решение Р-405): разбор запроса без
 * базы и без Next.
 *
 * Замечания разбирает руководитель на экране «Замечания»; правки по ним
 * делает исполнитель кода, у которого учётной записи в кабинете нет и быть
 * не должно. Ему открыт отдельный вход — по длинному ключу из
 * `FEEDBACK_EXPORT_TOKEN` (`deploy/.env`): перечень замечаний, снимки к ним
 * и разбор (состояние, критичность, «что сделано»). Больше ключ не открывает
 * ничего: ни заявок, ни кабинета, ни файлов работ.
 *
 * Ключ не задан или короче 32 знаков — адреса нет: ответ 404, как на любой
 * несуществующий. Неверный ключ отвечает так же, чтобы снаружи не было
 * видно, включена ли выгрузка. Ключ сравнивается по отпечаткам SHA-256 за
 * постоянное время; частота запросов с одного адреса ограничена.
 */

export const EXPORT_KEY_MIN = 32;
/** Тело разбора — три коротких поля; больше принимать незачем. */
export const REVIEW_BODY_MAX = 16 * 1024;
/** Сколько замечаний отдаётся за раз: свежие сверху. */
export const EXPORT_LIMIT = 5000;

/**
 * Триста запросов на адрес за десять минут: снимки забираются по одному, и
 * полная выгрузка — это перечень плюс по запросу на снимок. Подбору ключа
 * длиной 32 знака предел не нужен, он отсекает долбёжку.
 */
export const exportLimiter = new RateLimiter({ windowMs: 10 * 60_000, limit: 300, maxKeys: 5000 });

const NOT_FOUND = 'Не найдено';
const RATE_LIMITED = 'Слишком много запросов — повторите через несколько минут.';

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

/** Ключ выгрузки задан и совпал с присланным в `Authorization: Bearer …`. */
export function exportKeyOk(authorization: string | null, secret: string | undefined): boolean {
  const expected = (secret ?? '').trim();
  if (expected.length < EXPORT_KEY_MIN) return false;
  const match = /^Bearer\s+(\S+)\s*$/u.exec(authorization ?? '');
  if (match === null) return false;
  return timingSafeEqual(digest(match[1]!), digest(expected));
}

export interface ExportRow {
  readonly id: string;
  readonly createdAt: Date;
  readonly area: FeedbackArea;
  readonly pathTemplate: string;
  readonly text: string;
  readonly device: string;
  readonly viewportWidth: number | null;
  readonly screenshotKey: string | null;
  readonly screenshotType: string | null;
  readonly screenshotSize: number | null;
  readonly severityAuto: FeedbackSeverity;
  readonly severity: FeedbackSeverity;
  readonly status: FeedbackStatus;
  readonly note: string | null;
  readonly resolvedAt: Date | null;
}

/** Строка выгрузки: значения для машины и подписи — те же, что в таблице на Диске. */
export function toExportItem(row: ExportRow) {
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    createdAtMsk: mskMoment(row.createdAt),
    area: row.area,
    areaLabel: AREA_LABEL[row.area],
    page: row.pathTemplate,
    text: row.text,
    device: row.device,
    viewportWidth: row.viewportWidth,
    severityAuto: row.severityAuto,
    severityAutoLabel: SEVERITY_LABEL[row.severityAuto],
    severity: row.severity,
    severityLabel: SEVERITY_LABEL[row.severity],
    status: row.status,
    statusLabel: STATUS_LABEL[row.status],
    note: row.note,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    resolvedAtMsk: row.resolvedAt === null ? null : mskMoment(row.resolvedAt),
    screenshot:
      row.screenshotKey === null || row.screenshotType === null
        ? null
        : { type: row.screenshotType, size: row.screenshotSize },
  };
}

/** Отбор по состояниям: `?status=NEW,IN_WORK`. Неизвестные значения отбрасываются. */
export function parseStatuses(value: string | null): FeedbackStatus[] | null {
  if (value === null || value.trim() === '') return null;
  const statuses = [...new Set(value.split(',').map((s) => s.trim().toUpperCase()).filter(isStatus))];
  return statuses.length === 0 ? null : statuses;
}

export interface ReviewPatch {
  readonly status?: FeedbackStatus;
  readonly severity?: FeedbackSeverity;
  readonly note?: string;
}

/** Разбор тела `{status?, severity?, note?}`: строка ошибки или правка. */
export function parseReviewPatch(body: unknown): ReviewPatch | string {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return 'Ожидается объект с полями status, severity, note.';
  }
  const input = body as Record<string, unknown>;
  const unknownKeys = Object.keys(input).filter((k) => !['status', 'severity', 'note'].includes(k));
  if (unknownKeys.length > 0) return `Неизвестные поля: ${unknownKeys.join(', ')}.`;
  const patch: { status?: FeedbackStatus; severity?: FeedbackSeverity; note?: string } = {};
  if (input.status !== undefined) {
    if (!isStatus(input.status)) return `status — одно из: ${Object.keys(STATUS_LABEL).join(', ')}.`;
    patch.status = input.status;
  }
  if (input.severity !== undefined) {
    if (!isSeverity(input.severity)) return `severity — одно из: ${Object.keys(SEVERITY_LABEL).join(', ')}.`;
    patch.severity = input.severity;
  }
  if (input.note !== undefined) {
    if (typeof input.note !== 'string') return 'note — строка.';
    if (input.note.length > NOTE_MAX) return `note длиннее ${NOTE_MAX} знаков.`;
    patch.note = input.note;
  }
  if (Object.keys(patch).length === 0) return 'Нечего менять: укажите status, severity или note.';
  return patch;
}

export interface ExportService {
  list(statuses: FeedbackStatus[] | null): Promise<readonly ExportRow[]>;
  screenshot(id: string): Promise<{ stream: ReadableStream<Uint8Array>; sizeBytes: number; contentType: string } | null>;
  /** `null` — замечания нет. Ошибка проверки — исключение с текстом для ответа. */
  review(id: string, patch: ReviewPatch): Promise<ExportRow | null>;
}

export interface ExportOptions {
  readonly secret: string | undefined;
  readonly limiter: RateLimiter;
  readonly service: ExportService;
  /** Часы сервера; подменяются в тестах. */
  readonly now?: () => Date;
}

const PRIVATE = { 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex, nofollow' };

function json(status: number, body: unknown): Response {
  return Response.json(body, { status, headers: PRIVATE });
}

/** Общий вход: предел частоты, затем ключ. `null` — пропустить. */
function guard(request: Request, options: ExportOptions): Response | null {
  if (options.limiter.hit(clientIp(request.headers))) return json(429, { ok: false, error: RATE_LIMITED });
  if (!exportKeyOk(request.headers.get('authorization'), options.secret)) {
    return new Response(NOT_FOUND, { status: 404, headers: PRIVATE });
  }
  return null;
}

/** `GET /api/feedback/export[?status=NEW,IN_WORK]` — перечень, свежие сверху. */
export async function handleExportList(request: Request, options: ExportOptions): Promise<Response> {
  const denied = guard(request, options);
  if (denied !== null) return denied;
  const statuses = parseStatuses(new URL(request.url).searchParams.get('status'));
  const rows = await options.service.list(statuses);
  const at = (options.now ?? (() => new Date()))();
  return json(200, {
    generatedAt: at.toISOString(),
    generatedAtMsk: mskMoment(at),
    statuses,
    total: rows.length,
    items: rows.map(toExportItem),
  });
}

/** `GET /api/feedback/export/<id>/screenshot` — снимок экрана к замечанию. */
export async function handleExportScreenshot(request: Request, id: string, options: ExportOptions): Promise<Response> {
  const denied = guard(request, options);
  if (denied !== null) return denied;
  const file = await options.service.screenshot(id);
  if (file === null) return new Response(NOT_FOUND, { status: 404, headers: PRIVATE });
  return new Response(file.stream, {
    headers: {
      ...PRIVATE,
      'content-length': String(file.sizeBytes),
      'content-type': file.contentType,
      'x-content-type-options': 'nosniff',
    },
  });
}

/** `PATCH /api/feedback/export/<id>` — разбор: `{status?, severity?, note?}`. */
export async function handleExportReview(request: Request, id: string, options: ExportOptions): Promise<Response> {
  const denied = guard(request, options);
  if (denied !== null) return denied;

  const declared = Number(request.headers.get('content-length') ?? '');
  if (Number.isFinite(declared) && declared > REVIEW_BODY_MAX) {
    return json(413, { ok: false, error: 'Тело разбора слишком большое.' });
  }
  const raw = await request.text();
  if (raw.length > REVIEW_BODY_MAX) return json(413, { ok: false, error: 'Тело разбора слишком большое.' });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json(400, { ok: false, error: 'Тело — JSON-объект.' });
  }
  const patch = parseReviewPatch(body);
  if (typeof patch === 'string') return json(400, { ok: false, error: patch });

  let row: ExportRow | null;
  try {
    row = await options.service.review(id, patch);
  } catch (error) {
    // Отказ проверки разбора — простой Error с текстом для человека. Сбой
    // базы и прочее — свои классы ошибок: их текст наружу не отдаётся.
    if (error instanceof Error && Object.getPrototypeOf(error) === Error.prototype) {
      return json(400, { ok: false, error: error.message });
    }
    throw error;
  }
  if (row === null) return json(404, { ok: false, error: 'Замечание не найдено.' });
  return json(200, { ok: true, item: toExportItem(row) });
}
