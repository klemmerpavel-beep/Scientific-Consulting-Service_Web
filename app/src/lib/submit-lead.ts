'use client';

import { FIELD_LABELS } from './lead-schema';

/**
 * Отправка заявки из формы, перенесённой из макета.
 *
 * Формы в макетах не знают ни про сервер, ни про состояния отправки: их
 * обработчик только поднимал флаг «отправлено». Здесь этот обработчик
 * оборачивается — данные собираются прямо из формы по атрибутам name, поэтому
 * добавление поля в макет не требует правок здесь.
 */

export type SubmitState = {
  pending: boolean;
  error: string | null;
  fieldErrors: Record<string, string>;
};

export const emptyState: SubmitState = { pending: false, error: null, fieldErrors: {} };

/**
 * Момент, когда страница ожила в браузере. Разница до отправки отличает
 * человека от робота. Считаем от загрузки страницы, а не от появления формы:
 * так не нужно ничего вызывать из перенесённых компонентов, а значит нечему
 * и не сработать — на этом уже споткнулись, и все заявки уходили в спам.
 */
const pageShownAt = Date.now();

/** Определяем, куда именно уходит контакт: поле переключается вкладками */
function contactKind(form: HTMLFormElement): 'email' | 'phone' {
  const input = form.querySelector<HTMLInputElement>('input[name="contact"]');
  return input?.type === 'tel' ? 'phone' : 'email';
}

function collect(form: HTMLFormElement, source: string, formName: string) {
  const data = new FormData(form);
  const str = (k: string) => {
    const v = data.get(k);
    return typeof v === 'string' ? v.trim() : undefined;
  };
  return {
    source,
    form: formName,
    contactKind: contactKind(form),
    contact: str('contact') ?? '',
    name: str('name'),
    organization: str('organization'),
    topic: str('topic'),
    speciality: str('speciality'),
    need: str('need'),
    deadline: str('deadline') ?? str('term'),
    direction: str('direction'),
    message: str('message'),
    consent: data.get('consent') !== null,
    terms: data.get('terms') !== null,
    marketing: data.get('marketing') !== null,
    company_website: str('company_website') ?? '',
    elapsed: Date.now() - pageShownAt,
  };
}

/** Первое поле с ошибкой получает фокус — иначе на длинной форме её не найти */
function focusFirstError(form: HTMLFormElement, fieldErrors: Record<string, string>) {
  const first = Object.keys(fieldErrors)[0];
  if (!first) return;
  const el = form.querySelector<HTMLElement>(`[name="${CSS.escape(first)}"]`);
  if (el) {
    el.setAttribute('aria-invalid', 'true');
    el.focus({ preventScroll: false });
  }
}

export type SubmitOutcome =
  | { ok: true; id: string }
  | { ok: false; message: string; fieldErrors: Record<string, string> };

export async function submitLead(
  event: { preventDefault: () => void; currentTarget: HTMLFormElement },
  source: string,
  formName: string,
): Promise<SubmitOutcome> {
  event.preventDefault();
  const form = event.currentTarget;

  // Снимаем прошлые отметки, иначе поле останется красным после исправления
  form.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));

  // Родная проверка браузера идёт первой: она уже подписана и озвучивается
  if (typeof form.reportValidity === 'function' && !form.reportValidity()) {
    return { ok: false, message: '', fieldErrors: {} };
  }

  const payload = collect(form, source, formName);

  let res: Response;
  try {
    res = await fetch('/api/lead', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    return {
      ok: false,
      message: 'Не удалось связаться с сервером. Проверьте соединение и попробуйте ещё раз.',
      fieldErrors: {},
    };
  }

  let body: any = null;
  try {
    body = await res.json();
  } catch {
    /* тело может быть пустым — сообщение соберём по коду ответа */
  }

  if (res.ok && body?.ok) {
    form.reset();
    return { ok: true, id: String(body.id ?? '') };
  }

  const fieldErrors: Record<string, string> = body?.errors ?? {};
  if (Object.keys(fieldErrors).length) focusFirstError(form, fieldErrors);

  const listed = Object.entries(fieldErrors)
    .map(([k, v]) => `${FIELD_LABELS[k] ?? k}: ${v}`)
    .join('. ');

  return {
    ok: false,
    message:
      listed ||
      body?.message ||
      (res.status === 429
        ? 'Слишком много попыток подряд. Подождите минуту.'
        : 'Не удалось отправить заявку. Попробуйте ещё раз или напишите нам на почту.'),
    fieldErrors,
  };
}
