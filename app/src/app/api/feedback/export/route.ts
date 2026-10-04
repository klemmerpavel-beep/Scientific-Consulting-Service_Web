import { feedbackExportService } from '../../../../lib/cabinet/feedback';
import { exportLimiter, handleExportList } from '../../../../lib/feedback-export';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Перечень замечаний по ключу выгрузки (решение Р-279). Разбор запроса и
 * проверка ключа — в `lib/feedback-export.ts`, чтение базы — в
 * `lib/cabinet/feedback.ts`. Без ключа в `FEEDBACK_EXPORT_TOKEN` адреса нет.
 */
export async function GET(request: Request): Promise<Response> {
  return handleExportList(request, {
    secret: process.env.FEEDBACK_EXPORT_TOKEN,
    limiter: exportLimiter,
    service: feedbackExportService,
  });
}
