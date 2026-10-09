'use client';

import { useEffect } from 'react';

import { LEAD_SENT_EVENT } from './LeadThanks';

/**
 * Заявка из шапки — окном поверх страницы (решение Р-484).
 *
 * Кнопка «Оставить заявку» в шапке прежде прокручивала страницу к форме
 * внизу. Теперь та же форма раскрывается окном по центру, страница за ним
 * размывается. Своей формы у окна нет: показывается нижняя форма этой же
 * страницы (`#request form`) — с её полями, проверками и отправкой. Поэтому
 * на каждой странице форма своего направления, а состав полей, согласия и
 * путь заявки не меняются (CONTRIBUTING, правило 2).
 *
 * Заголовок окна — заголовок раздела заявки этой страницы. Закрыть окно
 * можно крестиком, клавишей Esc или нажатием мимо формы. После успешной
 * отправки окно закрывается само, и поверх страницы встаёт благодарность
 * (`LeadThanks`, Р-406). Фокус переходит в первое поле, Tab не выходит за
 * окно, по закрытии фокус возвращается на кнопку в шапке.
 *
 * Без скриптов ссылка остаётся якорем и прокручивает к форме, как прежде.
 * Остальные ссылки «#request» на странице (в тексте разделов) окно не
 * открывают: они ведут к форме рядом с местом чтения.
 *
 * Слой — под благодарностью (45) и уведомлением о cookies (50), над окном
 * отзыва (40) и кнопкой замечаний (30/31).
 */

const CSS = `
.pd-rq-veil{position:fixed;inset:0;z-index:43;background:rgba(20,22,28,.32);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);animation:pd-rq-fade 220ms cubic-bezier(.2,0,.2,1)}
form.pd-rq-open{position:fixed!important;z-index:44!important;left:50%!important;top:50%!important;transform:translate(-50%,-50%)!important;box-sizing:border-box!important;width:min(560px,calc(100vw - 24px))!important;max-height:calc(100dvh - 24px)!important;overflow:auto!important;margin:0!important;padding:24px 22px 22px!important;background:var(--pd-ink-inverse,#FFFFFF)!important;border:1px solid var(--pd-border,#E3E7EC)!important;border-radius:14px!important;box-shadow:0 10px 20px rgba(20,22,28,.09),0 1px 2px rgba(20,22,28,.05)!important;opacity:1!important;visibility:visible!important;filter:none!important;animation:pd-rq-rise 220ms cubic-bezier(.2,0,.2,1)}
.pd-rq-title{margin:0 44px 4px 0;font-family:var(--pd-serif,'Literata'),Georgia,'Times New Roman',serif;font-size:20px;line-height:1.4;font-weight:500;letter-spacing:-.012em;color:var(--pd-ink,#14161C);flex:1 1 100%}
.pd-rq-close{position:absolute;top:12px;right:12px;appearance:none;box-sizing:border-box;width:44px;height:44px;display:flex;align-items:center;justify-content:center;padding:0;border:1px solid transparent;border-radius:999px;background:transparent;color:var(--pd-ink-secondary,#3D4450);cursor:pointer;transition:border-color 180ms cubic-bezier(.2,0,.2,1),color 180ms cubic-bezier(.2,0,.2,1)}
.pd-rq-close:hover{border-color:var(--pd-border,#E3E7EC);color:var(--pd-ink,#14161C)}
.pd-rq-close:focus-visible{outline:2px solid var(--pd-accent,#14417A);outline-offset:2px}
html.pd-rq-lock{overflow:hidden}
@keyframes pd-rq-fade{from{opacity:0}to{opacity:1}}
@keyframes pd-rq-rise{from{opacity:0;transform:translate(-50%,calc(-50% + 8px))}to{opacity:1;transform:translate(-50%,-50%)}}
@media (prefers-reduced-motion:reduce){.pd-rq-veil,form.pd-rq-open,.pd-rq-close{animation:none!important;transition:none!important}}
@media print{.pd-rq-veil{display:none!important}}
`;

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface Open {
  readonly form: HTMLFormElement;
  readonly opener: HTMLElement;
  /** Метка на месте формы: туда форма возвращается после закрытия. */
  readonly mark: Comment;
  readonly veil: HTMLDivElement;
  readonly title: HTMLParagraphElement;
  readonly close: HTMLButtonElement;
}

/** Видимые элементы окна, до которых доходит Tab: ловушка поля-приманки не трогает. */
function focusables(form: HTMLFormElement): HTMLElement[] {
  return [...form.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => el.tabIndex !== -1 && el.getClientRects().length > 0,
  );
}

export default function RequestDialog() {
  useEffect(() => {
    let open: Open | null = null;

    const shut = (returnFocus: boolean) => {
      if (open === null) return;
      const { form, opener, mark, veil, title, close } = open;
      open = null;
      mark.replaceWith(form);
      form.classList.remove('pd-rq-open');
      form.removeAttribute('role');
      form.removeAttribute('aria-modal');
      form.removeAttribute('aria-labelledby');
      title.remove();
      close.remove();
      veil.remove();
      document.documentElement.classList.remove('pd-rq-lock');
      document.removeEventListener('keydown', onKey, true);
      if (returnFocus) opener.focus({ preventScroll: true });
    };

    const onKey = (event: KeyboardEvent) => {
      if (open === null) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        shut(true);
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusables(open.form);
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement;
      // Фокус на body — элемент окна, где он стоял, заменён (вкладка
      // «почта/телефон» при переключении рисуется новой кнопкой). Браузер
      // помнит место удалённой кнопки и сам ведёт Tab к соседнему полю;
      // перехват уводил бы на крестик в начало окна (Р-509).
      if (active === null || active === document.body) return;
      if (event.shiftKey && (active === first || !open.form.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !open.form.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };

    const show = (form: HTMLFormElement, opener: HTMLElement) => {
      if (open !== null) return;
      const section = form.closest('section');
      const heading = section?.querySelector('h2')?.textContent?.trim() || 'Оставить заявку';

      const veil = document.createElement('div');
      veil.className = 'pd-rq-veil';
      // Второй клик двойного по кнопке шапки попадает уже в подложку:
      // повторные клики серии окно не закрывают (Р-509).
      veil.addEventListener('click', (event) => {
        if (event.detail > 1) return;
        shut(true);
      });

      const title = document.createElement('p');
      title.className = 'pd-rq-title';
      title.id = 'pd-rq-title';
      title.textContent = heading;

      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'pd-rq-close';
      close.setAttribute('aria-label', 'Закрыть окно заявки');
      close.innerHTML =
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
      close.addEventListener('click', () => shut(true));

      // Форма на время окна переносится к концу страницы: раздел заявки
      // внизу ещё не проявился при прокрутке (прозрачен и сдвинут), а
      // предок со сдвигом делает «fixed» относительным себе, а не экрану.
      // На её месте остаётся метка, по ней форма возвращается обратно.
      const mark = document.createComment('pd-rq');
      form.replaceWith(mark);
      form.prepend(title);
      form.prepend(close);
      form.classList.add('pd-rq-open');
      form.setAttribute('role', 'dialog');
      form.setAttribute('aria-modal', 'true');
      form.setAttribute('aria-labelledby', title.id);
      document.body.append(veil, form);
      document.documentElement.classList.add('pd-rq-lock');
      open = { form, opener, mark, veil, title, close };
      document.addEventListener('keydown', onKey, true);

      const first = focusables(form).find((el) => el !== close);
      (first ?? close).focus({ preventScroll: true });
    };

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element | null)?.closest?.('a[href="#request"]');
      if (!(link instanceof HTMLElement) || link.closest('header') === null) return;
      const form = document.querySelector<HTMLFormElement>('#request form');
      if (form === null) return;
      event.preventDefault();
      show(form, link);
    };

    // Заявка ушла — окно закрывается, благодарность встаёт поверх страницы.
    const onSent = (event: Event) => {
      const sent = (event as CustomEvent<{ form?: unknown }>).detail?.form;
      if (open !== null && sent === open.form) shut(false);
    };

    document.addEventListener('click', onClick, true);
    window.addEventListener(LEAD_SENT_EVENT, onSent);
    return () => {
      shut(false);
      document.removeEventListener('click', onClick, true);
      window.removeEventListener(LEAD_SENT_EVENT, onSent);
    };
  }, []);

  return <style dangerouslySetInnerHTML={{ __html: CSS }} />;
}
