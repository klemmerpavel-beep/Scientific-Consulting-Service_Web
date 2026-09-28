import type { ReactNode } from 'react';

import {
  LEAD_SWITCH_STATUSES,
  leadStatusLabel,
  leadStatusTone,
} from '../../lib/cabinet/lead-labels.ts';
import { SANS } from './tokens.ts';

/**
 * Плашка состояния заявки — цветом по состоянию (решение Р-270). Цвет
 * дублирует слово, а не заменяет его: название стоит на каждой плашке.
 */
export function LeadStatusChip({ status }: { status: string }) {
  const tone = leadStatusTone(status);
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 12px',
        borderRadius: 999,
        fontFamily: SANS,
        fontSize: 13,
        fontWeight: 500,
        lineHeight: 1.4,
        whiteSpace: 'nowrap',
        background: tone.bg,
        color: tone.ink,
        border: `1px solid ${tone.edge}`,
      }}
    >
      <Dot color={tone.ink} />
      {leadStatusLabel(status)}
    </span>
  );
}

function Dot({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      style={{ width: 8, height: 8, borderRadius: 999, background: color, flex: '0 0 8px' }}
    />
  );
}

/**
 * Переключатель состояния: ряд плашек-кнопок. Текущая залита своим цветом
 * и обведена цветом текста, остальные — белые с цветной точкой. Каждая —
 * отдельная кнопка отправки: состояние меняется одним нажатием, без
 * раскрывающегося списка (решение Р-270).
 */
export function LeadStatusSwitch({
  current,
  action,
  hidden,
}: {
  current: string;
  action: (form: FormData) => Promise<void>;
  hidden: ReactNode;
}) {
  return (
    <form action={action} style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {hidden}
      {LEAD_SWITCH_STATUSES.map((status) => {
        const tone = leadStatusTone(status);
        const active = status === current;
        return (
          <button
            key={status}
            type="submit"
            name="status"
            value={status}
            aria-pressed={active}
            className="cab-btn cab-lead-switch"
            style={{
              appearance: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              minHeight: 44,
              padding: '0 16px',
              borderRadius: 999,
              fontFamily: SANS,
              fontSize: 14,
              fontWeight: active ? 600 : 500,
              cursor: active ? 'default' : 'pointer',
              background: active ? tone.bg : 'var(--pd-ink-inverse)',
              color: active ? tone.ink : 'var(--pd-ink)',
              border: active ? `2px solid ${tone.ink}` : '1px solid var(--pd-field-edge)',
              transition: 'background 180ms cubic-bezier(.2,0,.2,1),border-color 180ms cubic-bezier(.2,0,.2,1)',
            }}
          >
            <Dot color={tone.ink} />
            {leadStatusLabel(status)}
          </button>
        );
      })}
    </form>
  );
}
