import { feedbackExportService } from '../../../../../../lib/cabinet/feedback';
import { exportLimiter, handleExportScreenshot } from '../../../../../../lib/feedback-export';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Снимок экрана к замечанию по ключу выгрузки (решение Р-279). */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  return handleExportScreenshot(request, id, {
    secret: process.env.FEEDBACK_EXPORT_TOKEN,
    limiter: exportLimiter,
    service: feedbackExportService,
  });
}
