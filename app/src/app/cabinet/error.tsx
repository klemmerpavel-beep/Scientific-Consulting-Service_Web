'use client';

import { MONO, SANS, SERIF } from '../../components/cabinet/tokens';

/**
 * Сбой на экране кабинета. Подробности ошибки наружу не выводятся: в них
 * попадают адреса, идентификаторы и куски запросов. Пользователю нужен
 * понятный выход, а разбор остаётся в журнале сервера.
 *
 * Это единственный клиентский компонент кабинета: Next требует его именно
 * таким, чтобы перерисовать ветку после сбоя.
 */
export default function CabinetError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main
      id="main"
      style={{
        boxSizing: 'border-box',
        maxWidth: 560,
        margin: '0 auto',
        padding: 'clamp(48px,8vw,96px) 30px',
        fontFamily: SANS,
        color: 'var(--pd-ink)',
      }}
    >
      <p
        style={{
          margin: '0 0 12px',
          fontFamily: MONO,
          fontSize: 12,
          letterSpacing: '.06em',
          textTransform: 'uppercase',
          color: 'var(--pd-ink-muted)',
        }}
      >
        Сбой
      </p>
      <h1
        style={{
          margin: '0 0 16px',
          fontFamily: SERIF,
          fontSize: 28,
          fontWeight: 500,
          lineHeight: 1.24,
        }}
      >
        Не удалось показать раздел
      </h1>
      <p style={{ margin: '0 0 24px', fontSize: 15, lineHeight: 1.6, color: 'var(--pd-ink-secondary)' }}>
        Данные не пострадали: кабинет ничего не сохраняет наполовину. Попробуйте открыть раздел
        снова, а если повторится — напишите менеджеру проекта.
      </p>
      <button
        type="button"
        onClick={reset}
        style={{
          minHeight: 44,
          padding: '0 20px',
          borderRadius: 999,
          border: 0,
          background: 'var(--pd-accent)',
          color: 'var(--pd-ink-inverse)',
          fontFamily: 'inherit',
          fontSize: 15,
          fontWeight: 500,
          cursor: 'pointer',
        }}
      >
        Открыть снова
      </button>
    </main>
  );
}
