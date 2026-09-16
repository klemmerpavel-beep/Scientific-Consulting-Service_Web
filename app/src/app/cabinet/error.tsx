'use client';

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
        fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif",
        color: '#14161C',
      }}
    >
      <p
        style={{
          margin: '0 0 12px',
          fontFamily: "'JetBrains Mono','SFMono-Regular',monospace",
          fontSize: 12,
          letterSpacing: '.06em',
          textTransform: 'uppercase',
          color: '#5C6474',
        }}
      >
        Сбой
      </p>
      <h1
        style={{
          margin: '0 0 16px',
          fontFamily: "'Literata', Georgia, serif",
          fontSize: 28,
          fontWeight: 500,
          lineHeight: 1.24,
        }}
      >
        Не удалось показать раздел
      </h1>
      <p style={{ margin: '0 0 24px', fontSize: 15, lineHeight: 1.6, color: '#3D4450' }}>
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
          background: '#14417A',
          color: '#FFFFFF',
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
