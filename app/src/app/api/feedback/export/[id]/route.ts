import { feedbackExportService } from '../../../../../lib/cabinet/feedback';
import { exportLimiter, handleExportReview } from '../../../../../lib/feedback-export';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Разбор замечания по ключу выгрузки: `{status?, severity?, note?}` (решение Р-279). */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  return handleExportReview(request, id, {
    secret: process.env.FEEDBACK_EXPORT_TOKEN,
    limiter: exportLimiter,
    service: feedbackExportService,
  });
}
