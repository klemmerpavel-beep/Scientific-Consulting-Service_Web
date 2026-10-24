'use client';

import { useActionState, useEffect, useRef, useState } from 'react';

import { BUTTON_PRIMARY, BUTTON_QUIET, FIELD_CONTROL, MONO, RADIUS, SANS } from './tokens.ts';
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
  field = 'userId',
  selectLabel = 'Кому открыть вход',
  submitLabel = 'Выдать ссылку',
  askEmail = false,
  placeholder,
  initial,
}: {
  people: readonly { id: string; label: string }[];
  action: (state: AccessLinkState, form: FormData) => Promise<AccessLinkState>;
  /** Имя поля выбора: у руководителя — учётная запись, на карточке работы — работа (Р-285). */
  field?: string;
  selectLabel?: string;
  submitLabel?: string;
  /**
   * Поле «Почта клиента»: в карточке её нет, и вход открыть не на что.
   * После выдачи адрес уже в карточке, и поле уходит (решение Р-655).
   */
  askEmail?: boolean;
  /**
   * Первая строка выбора без человека: без явного выбора ссылка не уходит
   * первому в списке (решение Р-727). Без неё — прежний выбор первого.
   */
  placeholder?: string;
  /** Выбранный заранее: только что заведённая запись (Р-727). */
  initial?: string;
}) {
  const [state, submit, pending] = useActionState<AccessLinkState, FormData>(action, {
    link: null,
    note: null,
    error: null,
  });
  const [copied, setCopied] = useState(false);
  // Выбор держится состоянием: после действия React 19 сбрасывал список к
  // первой строке, и «Выдать новую ссылку» выдавала вход первому в списке,
  // а не тому, кому выдали только что (решение Р-704). Сброс формы после
  // действия — родной `form.reset()`: он ставит строку «по умолчанию» и
  // управляемого значения не знает, поэтому строкой по умолчанию делается
  // выбранная.
  // Заранее выбранный — только из перечня: чужой идентификатор из адреса
  // выбора не делает (решение Р-727).
  const [picked, setPicked] = useState(
    initial !== undefined && people.some((person) => person.id === initial)
      ? initial
      : placeholder !== undefined
        ? ''
        : (people[0]?.id ?? ''),
  );
  const pickRef = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    for (const option of pickRef.current?.options ?? []) option.defaultSelected = option.value === picked;
  }, [picked, people]);

  const label: React.CSSProperties = {
    display: 'block',
    fontFamily: SANS,
    fontSize: 14,
    lineHeight: 1.5,
    color: 'var(--pd-ink-secondary)',
    marginBottom: 6,
  };
  // Вид поля — общий с `Field` и `Select`: своя запись стояла в кромке
  // `--pd-border`, 1,24:1 к белому, и поле почти не читалось границей
  // (решение Р-253).
  const control = FIELD_CONTROL;

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <form action={submit} style={{ display: 'grid', gap: 14, maxWidth: 520 }}>
        <div>
          <label htmlFor="access-link-user" style={label}>
            {selectLabel}
          </label>
          <select
            ref={pickRef}
            id="access-link-user"
            name={field}
            required
            value={picked}
            onChange={(event) => setPicked(event.target.value)}
            style={control}
          >
            {placeholder === undefined ? null : (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.label}
              </option>
            ))}
          </select>
        </div>
        {askEmail && state.link === null ? (
          <div>
            <label htmlFor="access-link-email" style={label}>
              Почта клиента
            </label>
            <input
              id="access-link-email"
              name="email"
              type="email"
              required
              autoComplete="off"
              aria-describedby="access-link-email-hint"
              style={control}
            />
            <span
              id="access-link-email-hint"
              style={{
                display: 'block',
                marginTop: 6,
                fontFamily: SANS,
                fontSize: 13,
                lineHeight: 1.5,
                color: 'var(--pd-ink-muted)',
              }}
            >
              В карточке клиента почты нет: адрес запишется в карточку, и вход откроется на него.
            </span>
          </div>
        ) : null}
        <div>
          <button
            type="submit"
            disabled={pending || people.length === 0}
            className="cab-btn cab-btn-primary"
            style={{ ...BUTTON_PRIMARY, cursor: pending ? 'progress' : 'pointer' }}
          >
            {pending ? 'Выдаём…' : state.link === null ? submitLabel : 'Выдать новую ссылку'}
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
              // Кегль 16, как у всех полей: при 13 Safari на телефоне
              // увеличивал вьюпорт при фокусе (решения Р-86, Р-253).
              style={{ ...control, fontFamily: MONO }}
            />
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="cab-btn cab-btn-quiet"
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
