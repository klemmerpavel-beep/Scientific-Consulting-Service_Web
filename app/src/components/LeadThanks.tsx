'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';

/**
 * Благодарность за заявку — окном поверх страницы (решение Р-406).
 *
 * Прежде после отправки под формой появлялась строка «Заявка принята…»:
 * на длинной странице её не видно, а форма оставалась на месте, и было
 * непонятно, ушла ли заявка. Теперь страница за окном размывается, по
 * центру — чистая плашка с благодарностью; через четыре секунды окно
 * закрывается само, и человек возвращается на ту же страницу с очищенной
 * формой. Закрыть раньше — кнопкой, клавишей Esc или нажатием мимо плашки.
 *
 * Окно не знает форм: перенесённая страница после успешной отправки
 * посылает событие `pd:lead-sent` с текстом благодарности из макета и самой
 * формой (`tools/dc-to-tsx.mjs`). Фокус переходит в окно, Tab не выходит за
 * него, по закрытии возвращается на кнопку отправки этой формы, а если
 * форма была в окне заявки — на кнопку шапки, открывшую окно (Р-510). Наведение
 * на плашку останавливает отсчёт: дочитать можно не спеша.
 *
 * Слой — над окном отзыва (40) и кнопкой замечаний (30/31), ниже
 * уведомления о cookies (50).
 */

export const LEAD_SENT_EVENT = 'pd:lead-sent';
/** Сколько окно стоит само: заказчик просил 3–5 секунд. */
export const LEAD_THANKS_MS = 4000;
const LEAVE_MS = 180;

const CSS = `
.pd-lt{--lt-ink:var(--pd-ink,#14161C);--lt-ink-2:var(--pd-ink-secondary,#3D4450);--lt-paper:var(--pd-ink-inverse,#FFFFFF);--lt-border:var(--pd-border,#E3E7EC);--lt-quiet:var(--pd-surface-quiet,#F6F7F9);--lt-edge:var(--pd-edge-neutral,#C4CAD4);--lt-accent:var(--pd-accent,#14417A);--lt-ok-bg:var(--pd-ok-bg,#E6F9F1);--lt-ok-border:var(--pd-ok-border,#C5EEDD);--lt-ok-ink:var(--pd-ok-ink,#0E4E3C);--lt-sans:var(--pd-sans,'Inter'),'Helvetica Neue',Arial,sans-serif;--lt-serif:var(--pd-serif,'Literata'),Georgia,'Times New Roman',serif;--lt-ease:cubic-bezier(.2,0,.2,1);position:fixed;inset:0;z-index:45;display:flex;align-items:center;justify-content:center;box-sizing:border-box;padding:16px;background:rgba(20,22,28,.32);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);animation:pd-lt-fade 220ms var(--lt-ease)}
.pd-lt[data-leaving]{opacity:0;transition:opacity ${LEAVE_MS}ms var(--lt-ease)}
.pd-lt-card{box-sizing:border-box;width:min(400px,100%);padding:28px 24px 24px;background:var(--lt-paper);border:1px solid var(--lt-border);border-radius:14px;box-shadow:0 10px 20px rgba(20,22,28,.09),0 1px 2px rgba(20,22,28,.05);text-align:center;font-family:var(--lt-sans);color:var(--lt-ink);animation:pd-lt-rise 220ms var(--lt-ease)}
.pd-lt-mark{width:48px;height:48px;margin:0 auto 16px;display:flex;align-items:center;justify-content:center;border-radius:50%;background:var(--lt-ok-bg);border:1px solid var(--lt-ok-border);color:var(--lt-ok-ink)}
.pd-lt-title{margin:0;font-family:var(--lt-serif);font-size:22px;line-height:1.3;font-weight:500;letter-spacing:-.015em;color:var(--lt-ink)}
.pd-lt-title:focus{outline:none}
.pd-lt-text{margin:10px 0 0;font-size:16px;line-height:1.6;color:var(--lt-ink-2)}
.pd-lt-close{appearance:none;box-sizing:border-box;min-height:44px;margin:20px 0 0;padding:0 24px;border:1px solid var(--lt-edge);border-radius:999px;background:transparent;color:var(--lt-ink);font-family:var(--lt-sans);font-size:14px;font-weight:600;line-height:1.2;cursor:pointer;transition:border-color 180ms var(--lt-ease),background 180ms var(--lt-ease)}
.pd-lt-close:hover{border-color:var(--lt-accent);background:var(--lt-quiet)}
.pd-lt-close:focus-visible{outline:2px solid var(--lt-accent);outline-offset:2px}
@keyframes pd-lt-fade{from{opacity:0}to{opacity:1}}
@keyframes pd-lt-rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.pd-lt,.pd-lt-card,.pd-lt-close{animation:none!important;transition:none!important}}
@media print{.pd-lt{display:none!important}}
`;

interface Shown {
  readonly text: string;
  readonly form: HTMLFormElement | null;
  /**
   * Подробности события: окно заявки (`RequestDialog`) кладёт туда
   * `returnTo` — кнопку шапки, открывшую окно. Читается при закрытии, а не
   * при показе: так порядок слушателей события не важен (Р-510).
   */
  readonly detail: { returnTo?: unknown };
}

export default function LeadThanks() {
  const [shown, setShown] = useState<Shown | null>(null);
  const [leaving, setLeaving] = useState(false);
  const shownRef = useRef<Shown | null>(null);
  const leavingRef = useRef(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ids = useId();
  const titleId = `${ids}-title`;
  const textId = `${ids}-text`;

  const stopTimer = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  };

  const close = useCallback(() => {
    // Таймер и нажатие могут сойтись: закрывается один раз.
    if (shownRef.current === null || leavingRef.current) return;
    stopTimer();
    leavingRef.current = true;
    setLeaving(true);
    const { form, detail } = shownRef.current;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setTimeout(() => {
      shownRef.current = null;
      leavingRef.current = false;
      setShown(null);
      setLeaving(false);
      // Фокус — туда, откуда отправили заявку: на кнопку шапки, если
      // форма была в окне заявки, иначе на кнопку отправки той же формы.
      // Человек остаётся там, где был, а читалка не теряет место.
      const returnTo = detail.returnTo;
      const back = returnTo instanceof HTMLElement && returnTo.isConnected ? returnTo : null;
      const button = form?.querySelector<HTMLElement>('[type="submit"]');
      (back ?? button ?? form)?.focus({ preventScroll: true });
    }, reduced ? 0 : LEAVE_MS);
  }, []);

  const startTimer = useCallback(() => {
    if (leavingRef.current) return;
    stopTimer();
    timer.current = setTimeout(close, LEAD_THANKS_MS);
  }, [close]);

  useEffect(() => {
    const onSent = (event: Event) => {
      const detail = (event as CustomEvent<{ text?: unknown; form?: unknown; returnTo?: unknown }>).detail ?? {};
      const text = typeof detail.text === 'string' && detail.text.trim() !== '' ? detail.text.trim() : 'Заявка принята.';
      const form = detail.form instanceof HTMLFormElement ? detail.form : null;
      const next = { text, form, detail };
      shownRef.current = next;
      leavingRef.current = false;
      setLeaving(false);
      setShown(next);
    };
    window.addEventListener(LEAD_SENT_EVENT, onSent);
    return () => {
      window.removeEventListener(LEAD_SENT_EVENT, onSent);
      stopTimer();
    };
  }, []);

  useEffect(() => {
    if (shown === null) return;
    titleRef.current?.focus();
    startTimer();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== 'Tab') return;
      // В окне одна кнопка: Tab держится на ней.
      event.preventDefault();
      cardRef.current?.querySelector<HTMLElement>('.pd-lt-close')?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [shown, startTimer, close]);

  if (shown === null) return null;

  const title = 'Спасибо!';
  // «Спасибо, …» в тексте макета второй раз не повторяется.
  const text = shown.text.replace(/^Спасибо,\s*/u, '').replace(/^./u, (c) => c.toUpperCase());

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div
        className="pd-lt"
        data-leaving={leaving ? '' : undefined}
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
      >
        <div
          ref={cardRef}
          className="pd-lt-card"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={textId}
          onMouseEnter={stopTimer}
          onMouseLeave={startTimer}
        >
          <div className="pd-lt-mark" aria-hidden="true">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" focusable="false">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </div>
          <h2 ref={titleRef} id={titleId} className="pd-lt-title" tabIndex={-1}>
            {title}
          </h2>
          <p id={textId} className="pd-lt-text">
            {text}
          </p>
          <button type="button" className="pd-lt-close" onClick={close}>
            Закрыть
          </button>
        </div>
      </div>
    </>
  );
}
