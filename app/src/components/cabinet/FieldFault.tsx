'use client';

/**
 * Пометка поля, к которому относится отказ действия (аудит 15.11.2026,
 * находка Д-2; решение Р-936).
 *
 * Блок отказа стоит над формой и получает фокус (Р-919), но поле, из-за
 * которого действие отказало, оставалось обычным: читалка, дойдя до него,
 * не говорила ни что значение не принято, ни почему. Поле получает
 * `aria-invalid` и ссылку `aria-describedby` на текст отказа — причина
 * произносится вместе с подписью поля, а рамка поля берёт цвет отказа.
 *
 * Пометка ставится в браузере: поле рисует общий `Field`, который об
 * отказе не знает, а проводить признак через каждую форму значило бы
 * менять все экраны ради одного атрибута. Первое же изменение значения
 * пометку снимает: серверный отказ относился к прежнему значению.
 */

import { useEffect } from 'react';

type Control = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

function isControl(node: Element | null): node is Control {
  return (
    node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement || node instanceof HTMLSelectElement
  );
}

export default function FieldFault({ field, by, mark }: { field: string; by: string; mark: string }) {
  useEffect(() => {
    const control = document.getElementById(field);
    if (!isControl(control)) return undefined;
    const before = control.getAttribute('aria-describedby');
    control.setAttribute('aria-invalid', 'true');
    control.setAttribute('aria-describedby', before === null || before === '' ? by : `${before} ${by}`);
    const clear = () => {
      control.removeAttribute('aria-invalid');
      if (before === null) control.removeAttribute('aria-describedby');
      else control.setAttribute('aria-describedby', before);
      control.removeEventListener('input', clear);
      control.removeEventListener('change', clear);
    };
    control.addEventListener('input', clear);
    control.addEventListener('change', clear);
    return clear;
    // `mark` — отметка отказа: повторный отказ в той же форме ставит пометку заново.
  }, [field, by, mark]);
  return null;
}
