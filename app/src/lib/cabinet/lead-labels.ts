/**
 * Человеческие названия страницы-источника и состояния обращения.
 *
 * Перечни стояли в четырёх местах — на сводке, в перечне заявок, в выгрузке
 * и в доставке — и уже разошлись: одна и та же страница называлась
 * «Бизнесу» и «Компаниям», одно и то же состояние — «Консультация» и
 * «Консультация проведена». Руководитель читает эти экраны подряд, и
 * расхождение он принимает за разные вещи.
 *
 * Названия сверены с сайтом: раздел обращается к компаниям, а не к бизнесу.
 */
export const LEAD_SOURCE_LABEL: Record<string, string> = {
  landing: 'Посадочная',
  postgrad: 'Аспирантам',
  students: 'Студентам',
  business: 'Компаниям',
  cabinet: 'Из кабинета',
};

export const LEAD_STATUS_LABEL: Record<string, string> = {
  NEW: 'Новая',
  IN_PROGRESS: 'В работе',
  AWAITING_REPLY: 'Отработана, ждёт ответа',
  CONSULTED: 'Консультация проведена',
  CONTRACTED: 'Договор заключён',
  DECLINED: 'Отказ',
  SPAM: 'Спам',
};

/**
 * Неизвестное значение возвращается как есть, а не заменяется прочерком:
 * если в базе появится источник, о котором экран не знает, руководитель
 * должен увидеть его код, а не пустое место.
 */
export function leadSourceLabel(value: string): string {
  return LEAD_SOURCE_LABEL[value] ?? value;
}

export function leadStatusLabel(value: string): string {
  return LEAD_STATUS_LABEL[value] ?? value;
}

/**
 * Состояния, которые руководитель и менеджер переключают плашками на экране
 * заявки (решение Р-270). «Договор заключён» ставит одобрение — вместе с
 * работой, «Отказ» — форма отказа с причиной и письмом заявителю: у этих
 * двух исходов есть последствия, и одной плашкой их не выставить.
 */
export const LEAD_SWITCH_STATUSES = ['NEW', 'IN_PROGRESS', 'AWAITING_REPLY', 'CONSULTED', 'SPAM'] as const;
export type LeadSwitchStatus = (typeof LEAD_SWITCH_STATUSES)[number];

export function isLeadSwitchStatus(value: string): value is LeadSwitchStatus {
  return (LEAD_SWITCH_STATUSES as readonly string[]).includes(value);
}

/** Цвет плашки состояния: фон, текст и кромка из токенов кабинета. */
export const LEAD_STATUS_TONE: Record<string, { bg: string; ink: string; edge: string }> = {
  NEW: { bg: 'var(--pd-accent-tint)', ink: 'var(--pd-accent)', edge: 'var(--pd-accent-edge)' },
  IN_PROGRESS: { bg: 'var(--pd-lead-work-bg)', ink: 'var(--pd-lead-work-ink)', edge: 'var(--pd-lead-work-edge)' },
  AWAITING_REPLY: { bg: 'var(--pd-lead-wait-bg)', ink: 'var(--pd-lead-wait-ink)', edge: 'var(--pd-lead-wait-edge)' },
  CONSULTED: { bg: 'var(--pd-lead-talk-bg)', ink: 'var(--pd-lead-talk-ink)', edge: 'var(--pd-lead-talk-edge)' },
  CONTRACTED: { bg: 'var(--pd-ok-bg)', ink: 'var(--pd-ok-ink)', edge: 'var(--pd-ok-border)' },
  DECLINED: { bg: 'var(--pd-lead-no-bg)', ink: 'var(--pd-lead-no-ink)', edge: 'var(--pd-lead-no-edge)' },
  SPAM: { bg: 'var(--pd-surface-quiet)', ink: 'var(--pd-ink-muted)', edge: 'var(--pd-border)' },
};

export function leadStatusTone(value: string) {
  return LEAD_STATUS_TONE[value] ?? LEAD_STATUS_TONE.SPAM!;
}

/**
 * Ссылка для связи с заявителем: `tel:` или `mailto:`. На телефоне звонок
 * из карточки заявки — одно нажатие (решение Р-276). Российский номер,
 * записанный с восьмёрки, приводится к +7. Нечитаемое значение ссылки не
 * получает: кнопка, открывающая пустой звонок, хуже её отсутствия.
 */
export function contactHref(kind: string, value: string): string | null {
  const text = value.trim();
  if (kind === 'email') {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(text)) return null;
    // Части адреса кодируются (RFC 6068): адрес с «?body=…» или «&cc=…»,
    // присланный с открытой формы, иначе подставлял бы в письмо менеджера
    // чужой текст и получателей (решение Р-433).
    const at = text.lastIndexOf('@');
    return `mailto:${encodeURIComponent(text.slice(0, at))}@${encodeURIComponent(text.slice(at + 1))}`;
  }
  const digits = text.replace(/[^\d+]/gu, '');
  const number = /^8\d{10}$/u.test(digits)
    ? `+7${digits.slice(1)}`
    : /^7\d{10}$/u.test(digits)
      ? `+${digits}`
      : digits;
  return /^\+?\d{7,15}$/u.test(number) ? `tel:${number}` : null;
}
