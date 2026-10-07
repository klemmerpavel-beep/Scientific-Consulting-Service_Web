import type { Mark } from '../../lib/cabinet/recommendations';
import { Button, Chip, Form, formatDay } from './ui';

const LABEL = { DONE: 'сделано', POSTPONED: 'отложено' } as const;

/**
 * Отметка рекомендации: «Сделано», «Отложить» или снятие отметки
 * (требования РК-16, РК-17, решения Р-349, Р-350). Возврат — на тот экран,
 * откуда отмечали.
 */
export default function RecommendationMarks({
  markKey,
  mark,
  back,
  action,
}: {
  markKey: string | null;
  mark: Mark | undefined;
  back: 'recommendations' | 'calendar';
  /** Серверное действие отметки — передаёт экран. */
  action: (form: FormData) => Promise<void>;
}) {
  if (markKey === null) return null;
  const form = (status: string, label: string) => (
    <Form action={action} inline>
      <input type="hidden" name="key" value={markKey} />
      <input type="hidden" name="status" value={status} />
      <input type="hidden" name="back" value={back} />
      <Button tone="quiet">{label}</Button>
    </Form>
  );
  return mark === undefined ? (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {form('DONE', 'Сделано')}
      {form('POSTPONED', 'Отложить')}
    </div>
  ) : (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      <Chip>{`${LABEL[mark.status]} ${formatDay(mark.at)}`}</Chip>
      {form('', 'Снять отметку')}
    </div>
  );
}
