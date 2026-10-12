/**
 * Документ → черновик «Новой заявки» клиента (решение Р-559).
 *
 * Разбор заполняет ту же форму, что клиент заполняет руками, и заявку
 * отправляет прежняя кнопка: проверки и пределы полей (Р-426) — как есть.
 * Сам документ ложится вложением заявки, поэтому не поместившееся в поле
 * не теряется — оно в приложенном файле.
 *
 * Подписи и заметки — клиентским словарём (Р-277): «заявка», «работа»,
 * «тип сопровождения». Модуль чистый: справочник передаётся параметром.
 */

import type { BriefFieldKey } from './fields.ts';
import { composeSummary, universityLine } from './order-draft.ts';
import { guessServiceCode, type ParsedBrief } from './parse.ts';

/** Пределы полей заявки — как в `REQUEST_LIMITS` (`queries.ts`). */
const LIMITS = {
  applicantName: 200,
  supervisorName: 200,
  topic: 500,
  deadline: 120,
  organization: 300,
  speciality: 200,
} as const;

export interface RequestDraft {
  readonly values: Readonly<Record<string, string>>;
  /** Что проверить: угаданный тип, не поместившееся в поле. */
  readonly notes: readonly string[];
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/ё/gu, 'е').replace(/\s+/gu, ' ').trim();
}

/**
 * Поля формы заявки из документа. `fields` — поля с учётом выбранного
 * варианта темы (`variantFields`), `brief` — для подсказки типа.
 */
export function requestDraftFromBrief(
  brief: Pick<ParsedBrief, 'article' | 'manual'>,
  fields: Partial<Record<BriefFieldKey, string>>,
  types: readonly { readonly code: string; readonly name: string }[],
): RequestDraft {
  const notes: string[] = [...brief.manual];

  // Тип сопровождения: по названию из документа, иначе — подсказка по
  // тексту (шифр направления, «статья»).
  let need = '';
  if (fields.serviceType !== undefined) {
    const wanted = normalize(fields.serviceType);
    const found =
      types.find((type) => normalize(type.name) === wanted) ??
      types.find((type) => normalize(type.name).includes(wanted) || wanted.includes(normalize(type.name)));
    need = found?.name ?? '';
  }
  if (need === '') {
    const guess = guessServiceCode({ fields, article: brief.article });
    need = (guess === null ? undefined : types.find((type) => type.code === guess)?.name) ?? '';
    notes.push(
      need === ''
        ? 'Тип сопровождения не распознан: выберите сами или оставьте «уточню при разговоре».'
        : `Тип сопровождения определён по тексту документа: «${need}» — проверьте.`,
    );
  }

  const fit = (key: keyof typeof LIMITS, label: string, value: string | undefined): string => {
    const text = (value ?? '').trim();
    if (text.length <= LIMITS[key]) return text;
    notes.push(`«${label}» длиннее ${LIMITS[key]} знаков — сократите; полный текст есть в приложенном документе.`);
    return '';
  };

  // Руководитель — своим полем, поэтому в «Что требуется» не повторяется.
  const message = composeSummary({ ...fields, supervisor: undefined });
  for (const part of message.omitted) notes.push(`В «Что требуется» не поместилось: «${part}» — это есть в приложенном документе.`);

  return {
    values: {
      applicantName: fit('applicantName', 'Ваши ФИО', fields.customer),
      supervisorName: fit('supervisorName', 'ФИО научного руководителя', fields.supervisor),
      need,
      topic: fit('topic', 'Тема работы', fields.topic),
      deadline: fit('deadline', 'Желаемый срок', fields.deadline),
      message: message.text,
      organization: fit('organization', 'Организация или вуз', universityLine(fields)),
      speciality: fit('speciality', 'Направление подготовки', fields.direction),
    },
    notes,
  };
}
