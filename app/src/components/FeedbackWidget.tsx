'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { usePathname } from 'next/navigation';

import {
  SCREENSHOT_MAX_BYTES,
  SCREENSHOT_TOO_BIG,
  TEXT_HINT,
  TEXT_MAX,
  TEXT_MIN,
  TEXT_TOO_SHORT,
  THANKS,
  areaOf,
  feedbackEnabled,
  pathTemplate,
} from '../lib/feedback';

/**
 * Кнопка замечаний справа внизу — на всех страницах сайта и на всех
 * экранах кабинета (решение Р-403).
 *
 * На время запуска руководитель и клиенты пишут сюда, что сломано или
 * неудобно; раз в неделю по замечаниям делаются точечные правки. Виджет
 * не собирает персональных данных: в запросе нет cookies (`credentials:
 * 'omit'`), страница уходит шаблоном без идентификаторов, имя и контакт
 * не спрашиваются, а текст с телефоном или почтой сервер не примет.
 * Снимок экрана можно приложить только на страницах сайта: на экранах
 * кабинета видны имена, суммы и темы работ.
 *
 * Выключатель — `NEXT_PUBLIC_FEEDBACK_WIDGET=off` при сборке, как номер
 * Метрики. В статической витрине кнопки нет: приёма там нет тоже.
 *
 * Оформление — токенами дизайн-системы: публичные страницы и кабинет
 * объявляют один и тот же блок `--pd-*`, а запасные значения повторяют
 * его на случай страницы без блока. Своя таблица стилей здесь, а не
 * встроенные стили: телефонная раскладка, кольцо фокуса, уменьшенное
 * движение и печать встроенным стилем не задаются.
 */
const ENABLED = feedbackEnabled(process.env.NEXT_PUBLIC_FEEDBACK_WIDGET);
const PREVIEW = process.env.NEXT_PUBLIC_PREVIEW === '1';

const SEND_FAILED = 'Не удалось отправить замечание. Попробуйте ещё раз через несколько минут.';
const SWITCHED_OFF = 'Приём замечаний сейчас выключен.';

/**
 * Слой: над содержимым и разделом отзывов (z-index 20), ниже окна отзыва
 * (40) и уведомления о cookies (50). Уведомление снизу, поэтому, пока оно
 * открыто, кнопка поднимается над ним.
 */
const CSS = `
.pd-fb{--fb-ink:var(--pd-ink,#14161C);--fb-ink-2:var(--pd-ink-secondary,#3D4450);--fb-muted:var(--pd-ink-muted,#5C6474);--fb-paper:var(--pd-ink-inverse,#FFFFFF);--fb-border:var(--pd-border,#E3E7EC);--fb-quiet:var(--pd-surface-quiet,#F6F7F9);--fb-accent:var(--pd-accent,#14417A);--fb-accent-hover:var(--pd-accent-hover,#0A2145);--fb-accent-active:var(--pd-accent-active,#081A38);--fb-edge:var(--pd-field-edge,#7D8697);--fb-ok-bg:var(--pd-ok-bg,#E6F9F1);--fb-ok-border:var(--pd-ok-border,#C5EEDD);--fb-ok-ink:var(--pd-ok-ink,#0E4E3C);--fb-err-bg:var(--pd-err-bg,#FAE7E5);--fb-err-border:var(--pd-err-border,#F0C9C3);--fb-err-ink:var(--pd-err-ink,#8E2C22);--fb-sans:var(--pd-sans,'Inter'),'Helvetica Neue',Arial,sans-serif;--fb-serif:var(--pd-serif,'Literata'),Georgia,'Times New Roman',serif;--fb-mono:var(--pd-mono,'JetBrains Mono'),'SFMono-Regular',monospace;--fb-ease:cubic-bezier(.2,0,.2,1)}
.pd-fb-toggle{position:fixed;z-index:30;right:calc(16px + env(safe-area-inset-right,0px));bottom:calc(16px + env(safe-area-inset-bottom,0px) + var(--fb-lift,0px));box-sizing:border-box;width:52px;height:52px;display:flex;align-items:center;justify-content:center;padding:0;margin:0;border:0;border-radius:50%;background:var(--fb-accent);color:var(--fb-paper);cursor:pointer;box-shadow:0 10px 20px rgba(20,22,28,.09),0 1px 2px rgba(20,22,28,.05);transition:background 180ms var(--fb-ease),transform 180ms var(--fb-ease),bottom 220ms var(--fb-ease)}
.pd-fb-toggle:hover{background:var(--fb-accent-hover)}
.pd-fb-toggle:active{background:var(--fb-accent-active);transform:scale(.97)}
.pd-fb :focus-visible{outline:2px solid var(--fb-accent);outline-offset:2px}
.pd-fb-panel{position:fixed;z-index:31;right:calc(16px + env(safe-area-inset-right,0px));bottom:calc(16px + env(safe-area-inset-bottom,0px) + var(--fb-lift,0px));box-sizing:border-box;width:min(400px,calc(100vw - 32px));max-height:calc(100dvh - 32px - var(--fb-lift,0px));overflow-y:auto;padding:20px;background:var(--fb-paper);border:1px solid var(--fb-border);border-radius:14px;box-shadow:0 10px 20px rgba(20,22,28,.09);font-family:var(--fb-sans);color:var(--fb-ink);animation:pd-fb-in 220ms var(--fb-ease)}
@keyframes pd-fb-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.pd-fb-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin:0 0 8px}
.pd-fb-title{margin:0;font-family:var(--fb-serif);font-size:20px;font-weight:500;line-height:1.24;color:var(--fb-ink)}
.pd-fb-close{flex:0 0 44px;width:44px;height:44px;margin:-10px -10px 0 0;display:flex;align-items:center;justify-content:center;padding:0;border:0;border-radius:50%;background:transparent;color:var(--fb-ink-2);cursor:pointer;transition:background 180ms var(--fb-ease),color 180ms var(--fb-ease)}
.pd-fb-close:hover{background:var(--fb-quiet);color:var(--fb-accent)}
.pd-fb-page{margin:0 0 16px;font-size:13px;line-height:1.5;color:var(--fb-ink-2);overflow-wrap:anywhere}
.pd-fb-page code{font-family:var(--fb-mono);font-size:12px;color:var(--fb-ink)}
.pd-fb-form{display:flex;flex-direction:column;gap:16px;margin:0}
.pd-fb-field{display:flex;flex-direction:column;gap:8px}
.pd-fb-label{font-size:14px;font-weight:600;line-height:1.4;color:var(--fb-ink)}
.pd-fb-hint{font-size:13px;line-height:1.5;color:var(--fb-muted)}
.pd-fb-text{box-sizing:border-box;width:100%;min-height:120px;padding:12px 14px;border:1px solid var(--fb-edge);border-radius:10px;background:var(--fb-paper);color:var(--fb-ink);font-family:var(--fb-sans);font-size:16px;line-height:1.5;resize:vertical;transition:border-color 180ms var(--fb-ease),box-shadow 180ms var(--fb-ease)}
.pd-fb-text:focus{border-color:var(--fb-accent);box-shadow:0 0 0 3px rgba(20,65,122,.16);outline:none}
.pd-fb-text::placeholder{color:var(--fb-muted);opacity:1}
.pd-fb-file{max-width:100%;font-family:var(--fb-sans);font-size:16px;color:var(--fb-ink-2)}
.pd-fb-file::file-selector-button{min-height:44px;padding:0 18px;margin-right:14px;border-radius:999px;border:1px solid var(--fb-edge);background:var(--fb-paper);color:var(--fb-ink-2);font-family:var(--fb-sans);font-size:15px;cursor:pointer}
.pd-fb-trap{position:absolute;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none}
.pd-fb-send{align-self:flex-start;min-height:44px;padding:0 22px;border:0;border-radius:999px;background:var(--fb-accent);color:var(--fb-paper);font-family:var(--fb-sans);font-size:15px;font-weight:600;line-height:1.4;cursor:pointer;transition:background 180ms var(--fb-ease),transform 180ms var(--fb-ease)}
.pd-fb-send:hover{background:var(--fb-accent-hover)}
.pd-fb-send:active{background:var(--fb-accent-active);transform:scale(.97)}
.pd-fb-send[aria-disabled=true]{opacity:.7;cursor:progress}
.pd-fb-ok,.pd-fb-err{margin:0;padding:12px 14px;border-radius:10px;font-size:14px;line-height:1.5;animation:pd-fb-in 220ms var(--fb-ease)}
.pd-fb-ok{background:var(--fb-ok-bg);border:1px solid var(--fb-ok-border);color:var(--fb-ok-ink)}
.pd-fb-err{background:var(--fb-err-bg);border:1px solid var(--fb-err-border);color:var(--fb-err-ink)}
@media (max-width:767px){.pd-fb-panel{left:calc(16px + env(safe-area-inset-left,0px));width:auto}}
@media (prefers-reduced-motion:reduce){.pd-fb *,.pd-fb-toggle,.pd-fb-panel{transition:none!important;animation:none!important}}
@media print{.pd-fb{display:none!important}}
`;

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]):not([tabindex="-1"]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

type Outcome = { tone: 'ok' | 'error'; text: string } | null;

export default function FeedbackWidget() {
  const pathname = usePathname() ?? '/';
  const template = pathTemplate(pathname);
  const site = areaOf(pathname) === 'SITE';

  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [lift, setLift] = useState(0);

  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const openedAt = useRef(0);
  const restoreFocus = useRef(false);

  const ids = useId();
  const titleId = `${ids}-title`;
  const textId = `${ids}-text`;
  const hintId = `${ids}-hint`;
  const fileId = `${ids}-file`;
  const fileHintId = `${ids}-file-hint`;

  // Уведомление о cookies стоит внизу во всю ширину телефона: пока оно
  // открыто, кнопка поднимается над ним, а не закрывает «Разрешить».
  useEffect(() => {
    if (!ENABLED || PREVIEW) return;
    const measure = () => {
      const banner = document.querySelector('[data-pd-consent]');
      setLift(banner === null ? 0 : Math.ceil(banner.getBoundingClientRect().height) + 12);
    };
    measure();
    const watch = new MutationObserver(measure);
    watch.observe(document.body, { childList: true });
    window.addEventListener('resize', measure);
    return () => {
      watch.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  useEffect(() => {
    if (open) {
      openedAt.current = Date.now();
      textRef.current?.focus();
    } else if (restoreFocus.current) {
      restoreFocus.current = false;
      toggleRef.current?.focus();
    }
  }, [open]);

  const close = useCallback(() => {
    restoreFocus.current = true;
    setOpen(false);
    setOutcome(null);
  }, []);

  // Ловушка Tab: фокус ходит по кругу внутри окна, Esc закрывает его.
  // Слушает документ, а не окно: фокус, выпавший из окна (например, на
  // страницу после щелчка мимо), Tab возвращает внутрь, а Esc работает
  // откуда угодно.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      const panel = panelRef.current;
      if (panel === null) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement;
      if (!panel.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, close]);

  if (!ENABLED || PREVIEW) return null;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (sending) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const text = String(data.get('text') ?? '').trim();
    if (text.length < TEXT_MIN) {
      setOutcome({ tone: 'error', text: TEXT_TOO_SHORT });
      textRef.current?.focus();
      return;
    }
    const shot = data.get('screenshot');
    if (shot instanceof File && shot.size > SCREENSHOT_MAX_BYTES) {
      setOutcome({ tone: 'error', text: SCREENSHOT_TOO_BIG });
      return;
    }
    if (!(shot instanceof File) || shot.size === 0) data.delete('screenshot');
    // Уходит шаблон, а не адрес: ключ входа и идентификаторы не покидают
    // браузер даже в теле запроса. Сервер всё равно сводит путь заново.
    data.set('path', template);
    data.set('width', String(window.innerWidth));
    data.set('openedAt', String(openedAt.current));

    setSending(true);
    setOutcome(null);
    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        body: data,
        // Без cookies: замечание не связывается ни с сессией, ни с входом.
        credentials: 'omit',
        cache: 'no-store',
      });
      if (response.status === 404) {
        setOutcome({ tone: 'error', text: SWITCHED_OFF });
        return;
      }
      const answer = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (answer?.ok === true) {
        form.reset();
        setOutcome({ tone: 'ok', text: THANKS });
        openedAt.current = Date.now();
      } else {
        setOutcome({ tone: 'error', text: answer?.error ?? SEND_FAILED });
      }
    } catch {
      setOutcome({ tone: 'error', text: SEND_FAILED });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="pd-fb cab-no-print" style={{ ['--fb-lift' as string]: `${lift}px` }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <button
        ref={toggleRef}
        type="button"
        className="pd-fb-toggle"
        aria-label="Оставить замечание"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
      >
        {/* Знак штриховой, как все значки системы: облачко реплики с
            восклицанием, без заливки. */}
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          <path d="M12 7v4" />
          <path d="M12 14h.01" />
        </svg>
      </button>

      {open ? (
        <div
          ref={panelRef}
          className="pd-fb-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
        >
          <div className="pd-fb-head">
            <h2 id={titleId} className="pd-fb-title">
              Замечание о странице
            </h2>
            <button type="button" className="pd-fb-close" aria-label="Закрыть" onClick={close}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true" focusable="false">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
          {/* Показываем ровно то, что будет записано: шаблон без
              идентификаторов и без строки запроса. */}
          <p className="pd-fb-page">
            Страница: <code>{template}</code>
          </p>

          <form ref={formRef} className="pd-fb-form" onSubmit={submit} noValidate>
            <input
              className="pd-fb-trap"
              type="text"
              name="company_website"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
            />
            <div className="pd-fb-field">
              <label className="pd-fb-label" htmlFor={textId}>
                Что не так
              </label>
              <textarea
                ref={textRef}
                id={textId}
                className="pd-fb-text"
                name="text"
                rows={5}
                maxLength={TEXT_MAX}
                required
                aria-describedby={hintId}
              />
              <span id={hintId} className="pd-fb-hint">
                {TEXT_HINT}
              </span>
            </div>

            {site ? (
              <div className="pd-fb-field">
                <label className="pd-fb-label" htmlFor={fileId}>
                  Снимок экрана (необязательно)
                </label>
                <input
                  id={fileId}
                  className="pd-fb-file"
                  type="file"
                  name="screenshot"
                  accept="image/png,image/jpeg,image/webp"
                  aria-describedby={fileHintId}
                />
                <span id={fileHintId} className="pd-fb-hint">
                  PNG, JPEG или WEBP, до 5 МБ.
                </span>
              </div>
            ) : null}

            {outcome === null ? null : (
              <p className={outcome.tone === 'ok' ? 'pd-fb-ok' : 'pd-fb-err'} role={outcome.tone === 'ok' ? 'status' : 'alert'}>
                {outcome.text}
              </p>
            )}

            {/* Не `disabled`: отключённая кнопка теряет фокус, и он уходит
                со страницы из окна — человек с клавиатуры терял место. */}
            <button type="submit" className="pd-fb-send" aria-disabled={sending}>
              {sending ? 'Отправляем…' : 'Отправить'}
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
