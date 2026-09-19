'use client';

import { useFormStatus } from 'react-dom';
import type { CSSProperties, ReactNode } from 'react';

import { BUTTON_CHIP, BUTTON_PRIMARY, BUTTON_QUIET } from './tokens.ts';

/**
 * Кнопка кабинета.
 *
 * Единственная часть раздела, работающая на стороне браузера, и ровно по
 * одной причине: пока серверное действие выполняется, человек не должен
 * гадать, нажалось ли. `useFormStatus` знает состояние ближайшей формы,
 * поэтому кнопка отправки гасится и объявляется занятой сама — без
 * состояния в разметке экрана.
 *
 * Правило `button[disabled]` в общих стилях кабинета написано под этот
 * случай и до сих пор ни разу не срабатывало: отключать кнопку было
 * некому.
 */

const TONES = {
  primary: BUTTON_PRIMARY,
  quiet: BUTTON_QUIET,
  chip: BUTTON_CHIP,
} as const;

export function Button({
  children,
  tone = 'primary',
  type = 'submit',
  name,
  value,
  style,
}: {
  children: ReactNode;
  tone?: 'primary' | 'quiet' | 'chip';
  type?: 'submit' | 'button';
  name?: string;
  value?: string;
  style?: CSSProperties;
}) {
  const status = useFormStatus();
  // Ждём только свою форму: у кнопки вне формы состояния нет, и
  // `useFormStatus` честно отдаёт «не занята».
  const busy = type === 'submit' && status.pending;

  return (
    <button
      type={type}
      name={name}
      value={value}
      disabled={busy}
      aria-busy={busy}
      className={`cab-btn ${tone === 'primary' ? 'cab-btn-primary' : 'cab-btn-quiet'}`}
      style={{ ...TONES[tone], ...style }}
    >
      {children}
    </button>
  );
}
