'use client';

import { useActionState, useState } from 'react';

import { BUTTON_PRIMARY, BUTTON_QUIET, MONO, RADIUS, SANS } from './tokens.ts';
import { Notice } from './ui.tsx';

/**
 * Состояние выдачи ссылки: то, что действие возвращает форме.
 *
 * Объявлено здесь, а не рядом с действием: сборка витрины уносит каталог
 * `app/cabinet` целиком, и общая часть кабинета не имеет права на него
 * ссылаться даже типом — сборка падает на неразрешённом модуле. Зависимость
 * разворачивается в обратную сторону: действие берёт тип отсюда.
 */
export interface AccessLinkState {
  readonly link: string | null;
  readonly note: string | null;
  readonly error: string | null;
}

/**
 * Выдача ссылки входа прямо в кабинете.
 *
 * Пока почтовый канал практики не настроен, войти может только тот, кому
 * ссылку выдали на сервере командой, — открытие кабинета клиенту
 * становится делом системного администратора, а не руководителя. Здесь
 * ссылка выдаётся на месте и передаётся тем каналом, которым с человеком
 * уже разговаривают (решение Р-195).
 *
 * Третья и последняя часть кабинета, работающая в браузере, и по той же
 * причине, что первые две: ссылку видно ровно один раз — в базе лежит
 * только свёртка проверочной части, — поэтому она возвращается действием
 * и показывается на месте, не попадая ни в адрес страницы, ни в
 * перезагрузку.
 */
export function AccessLink({
  people,
  action,
}: {
  people: readonly { id: string; label: string }[];
  action: (state: AccessLinkState, form: FormData) => Promise<AccessLinkState>;
}) {
  const [state, submit, pending] = useActionState<AccessLinkState, FormData>(action, {
    link: null,
    note: null,
    error: null,
  });
  const [copied, setCopied] = useState(false);

  const label: React.CSSProperties = {
    display: 'block',
    fontFamily: SANS,
    fontSize: 14,
    lineHeight: 1.5,
    color: 'var(--pd-ink-secondary)',
    marginBottom: 6,
  };
  const control: React.CSSProperties = {
    boxSizing: 'border-box',
    width: '100%',
    minHeight: 48,
    padding: '12px 14px',
    borderRadius: RADIUS.field,
    border: '1px solid var(--pd-border)',
    background: 'var(--pd-ink-inverse)',
    fontFamily: SANS,
    fontSize: 16,
    color: 'var(--pd-ink)',
  };

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <form action={submit} style={{ display: 'grid', gap: 14, maxWidth: 520 }}>
        <div>
          <label htmlFor="access-link-user" style={label}>
            Кому открыть вход
          </label>
          <select id="access-link-user" name="userId" required style={control}>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <button
            type="submit"
            disabled={pending || people.length === 0}
            style={{ ...BUTTON_PRIMARY, cursor: pending ? 'progress' : 'pointer' }}
          >
            {pending ? 'Выдаём…' : state.link === null ? 'Выдать ссылку' : 'Выдать новую ссылку'}
          </button>
        </div>
      </form>

      {state.error === null ? null : (
        // Отказ выдачи — исход действия, и оформляется общим блоком исхода,
        // а не абзацем с цветом ошибки: пара ok/err живёт только в `Notice`
        // (решения Р-146, Р-211).
        <Notice tone="error" role="alert">
          {state.error}
        </Notice>
      )}

      {state.link === null ? null : (
        <div
          style={{
            border: '1px solid var(--pd-accent-edge)',
            background: 'var(--pd-accent-tint)',
            borderRadius: RADIUS.card,
            padding: '14px 16px',
            display: 'grid',
            gap: 12,
            maxWidth: 640,
          }}
        >
          <p
            style={{
              margin: 0,
              fontFamily: SANS,
              fontSize: 14,
              lineHeight: 1.5,
              color: 'var(--pd-ink-secondary)',
            }}
          >
            {state.note}
          </p>
          {/* Поле, а не просто строка текста: из поля ссылку берут
              выделением и клавиатурой там, где буфер обмена закрыт
              настройками браузера. */}
          <div>
            <label htmlFor="access-link-value" style={label}>
              Ссылка для передачи
            </label>
            <input
              id="access-link-value"
              readOnly
              value={state.link}
              onFocus={(event) => event.currentTarget.select()}
              style={{ ...control, fontFamily: MONO, fontSize: 13 }}
            />
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              style={{ ...BUTTON_QUIET, cursor: 'pointer' }}
              onClick={() => {
                navigator.clipboard?.writeText(state.link ?? '').then(
                  () => setCopied(true),
                  () => setCopied(false),
                );
              }}
            >
              Скопировать
            </button>
            <span
              aria-live="polite"
              style={{ fontFamily: SANS, fontSize: 13, lineHeight: 1.5, color: 'var(--pd-ink-muted)' }}
            >
              {copied ? 'Скопировано' : 'Передайте лично: ссылка равна входу в кабинет'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
