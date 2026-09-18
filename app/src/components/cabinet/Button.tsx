'use client';

import { useFormStatus } from 'react-dom';
import type { CSSProperties, ReactNode } from 'react';

import { RADIUS, SANS } from './tokens.ts';

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

/** Цель нажатия не меньше 44 px — правило дизайн-системы сайта. */
const BUTTON_BASE: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  minHeight: 44,
  padding: '0 20px',
  borderRadius: RADIUS.pill,
  fontFamily: SANS,
  fontSize: 15,
  fontWeight: 600,
  lineHeight: 1.4,
  cursor: 'pointer',
  border: '1px solid transparent',
};

export const BUTTON_PRIMARY: CSSProperties = {
  ...BUTTON_BASE,
  background: 'var(--pd-accent)',
  color: 'var(--pd-ink-inverse)',
};

export const BUTTON_QUIET: CSSProperties = {
  ...BUTTON_BASE,
  background: 'var(--pd-ink-inverse)',
  color: 'var(--pd-ink-secondary)',
  border: '1px solid var(--pd-edge-neutral)',
};

export function Button({
  children,
  tone = 'primary',
  type = 'submit',
  name,
  value,
  style,
}: {
  children: ReactNode;
  tone?: 'primary' | 'quiet';
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
      style={{ ...(tone === 'primary' ? BUTTON_PRIMARY : BUTTON_QUIET), ...style }}
    >
      {children}
    </button>
  );
}
