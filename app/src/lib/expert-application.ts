/**
 * Анкета эксперта со страницы «Экспертам» (замечание владельца 13.10.2026,
 * решение Р-580): правила без базы и без Next — поля, пределы, файлы,
 * редакция согласия кандидата.
 *
 * Кто такой эксперт для сайта. Владелец писал «авторы работ, эксперты»;
 * на сайте страница говорит только об экспертах. Практика не пишет работ
 * за клиентов — автором остаётся клиент, — а реклама подготовки работ для
 * третьих лиц запрещена (п. 10 ст. 7 Федерального закона «О рекламе»).
 * Эксперт консультирует, проверяет и сопровождает; в кабинете он
 * называется куратором.
 */

import { z } from 'zod';

import { looksLikeEmail } from './lead-schema.ts';

/**
 * Редакция согласия кандидата — дата, с которой действует текст на
 * странице, и номер редакции за этот день после точки. Пишется в анкету:
 * по ней видно, с каким текстом согласился человек. Меняется вместе с
 * текстом согласия в макете.
 *
 * Вторая редакция 14.10.2026 (решение Р-584): в перечень данных вошли
 * учёное звание, место работы и должность, стаж, виды работ, отметки опыта,
 * идентификаторы автора (SPIN-код eLIBRARY, ORCID) и желаемая загрузка —
 * поля профессиональной анкеты. Первая редакция их не называла.
 */
export const EXPERT_CONSENT_VERSION = '2026-10-14.2';

/** Редакция согласия для людей: «2 от 14.10.2026» или «от 14.10.2026». */
export function consentVersionLabel(version: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:\.(\d+))?$/u.exec(version);
  if (match === null) return version;
  const date = `${match[3]}.${match[2]}.${match[1]}`;
  return match[4] === undefined ? `от ${date}` : `${match[4]} от ${date}`;
}

/** Учёная степень — выбор из четырёх, чтобы анкеты сравнивались. */
export const DEGREES = ['Без степени', 'Кандидат наук', 'Доктор наук', 'PhD'] as const;

/**
 * Перечни профессиональной анкеты (решение Р-584). Закрытые, чтобы
 * руководитель отбирал анкеты по ним, а не читал свободный текст.
 */
export const ACADEMIC_TITLES = ['Без звания', 'Доцент', 'Профессор'] as const;
export const SENIORITY = ['До 3 лет', '3–10 лет', 'Более 10 лет'] as const;
/** Виды работ — направления практики, где нужны кураторы. */
export const SERVICES = [
  'Кандидатские и докторские диссертации',
  'ВКР и магистерские диссертации',
  'Научные статьи',
  'Подготовка к защите',
  'Гранты и НИОКР',
  'Нормоконтроль и оформление',
] as const;
/** Отметки опыта — то, что проверяется по открытым источникам. */
export const ROLES = [
  'Руководство ВКР',
  'Научное руководство аспирантами',
  'Член диссертационного совета',
  'Официальный оппонент',
  'Рецензент научных журналов',
  'Рецензент заявок грантовых фондов',
] as const;
export const WEEKLY_HOURS = ['До 5 часов', '5–10 часов', '10–20 часов', 'Более 20 часов'] as const;

/** SPIN-код eLIBRARY: восемь цифр, пишется «1234-5678». `null` — не похоже. */
export function normalizeSpin(value: string): string | null {
  const digits = value.replace(/[\s-]/gu, '');
  return /^\d{8}$/u.test(digits) ? `${digits.slice(0, 4)}-${digits.slice(4)}` : null;
}

/**
 * ORCID: шестнадцать знаков группами по четыре, последний — контрольный
 * (ISO 7064 11,2, может быть X). Принимается и с адресом сайта. `null` —
 * не похоже или не сходится контрольная цифра: опечатку видно сразу.
 */
export function normalizeOrcid(value: string): string | null {
  const bare = value.trim().replace(/^https?:\/\/(www\.)?orcid\.org\//iu, '').toUpperCase();
  const match = /^(\d{4})-?(\d{4})-?(\d{4})-?(\d{3}[\dX])$/u.exec(bare);
  if (match === null) return null;
  const chars = match.slice(1).join('');
  let total = 0;
  for (const char of chars.slice(0, 15)) total = (total + Number(char)) * 2;
  const check = (12 - (total % 11)) % 11;
  if (chars[15] !== (check === 10 ? 'X' : String(check))) return null;
  return match.slice(1).join('-');
}

/** Файлов в анкете — резюме и до двух примеров работ. */
export const FILES_MAX = 3;
/** Предел одного файла: резюме и статья в PDF укладываются с запасом. */
export const FILE_MAX_BYTES = 10 * 1024 * 1024;
/** Предел всех файлов анкеты вместе. */
export const FILES_TOTAL_MAX_BYTES = 20 * 1024 * 1024;
/**
 * Предел тела запроса: файлы и поля формы с запасом на разметку
 * multipart. Тот же предел стоит в nginx (`location = /api/experts`).
 */
export const BODY_MAX_BYTES = 21 * 1024 * 1024;
/** Быстрее этого человек анкету не заполнит — это робот. */
export const MIN_ELAPSED_MS = 3000;

/**
 * Документы, которые принимает анкета. Расширение сверяется с началом
 * файла: переименованный исполняемый файл с «.pdf» на конце не пройдёт.
 */
export const FILE_KINDS: Readonly<Record<string, { readonly type: string; readonly magic: (head: Buffer) => boolean }>> = {
  pdf: { type: 'application/pdf', magic: (h) => h.subarray(0, 5).toString('latin1') === '%PDF-' },
  doc: { type: 'application/msword', magic: (h) => h.subarray(0, 4).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0])) },
  docx: {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    magic: (h) => h.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])),
  },
  odt: {
    type: 'application/vnd.oasis.opendocument.text',
    magic: (h) => h.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])),
  },
  rtf: { type: 'application/rtf', magic: (h) => h.subarray(0, 5).toString('latin1') === '{\\rtf' },
};

export const FILE_HINT = 'PDF, DOC, DOCX, ODT или RTF, до трёх файлов, каждый до 10 МБ, вместе до 20 МБ';

/** Ошибка анкеты с ответом для человека и кодом ответа. */
export class ExpertInputError extends Error {
  readonly status: number;
  constructor(message: string, status = 422) {
    super(message);
    this.status = status;
  }
}

const text = (max: number) => z.string().trim().max(max, `Не длиннее ${max} знаков`);

/** Телефон — как пишут люди; сверяется по числу цифр. */
function looksLikePhone(value: string): boolean {
  const digits = value.replace(/\D/gu, '');
  return /^[\d\s()+\-.]{10,24}$/u.test(value) && digits.length >= 10 && digits.length <= 15;
}

export const expertApplicationSchema = z
  .object({
    fullName: text(160).min(3, 'Напишите фамилию, имя и отчество'),
    email: text(160),
    phone: text(24).optional(),
    degree: z.enum(DEGREES, { message: 'Выберите учёную степень' }),
    speciality: text(200).optional(),
    fields: text(2000).min(10, 'Расскажите, в каких областях и с какими темами вы работаете'),
    experience: text(4000).min(20, 'Расскажите об опыте: руководство, рецензирование, преподавание, публикации'),
    links: text(1000).optional(),
    academicTitle: z.enum(ACADEMIC_TITLES, { message: 'Выберите учёное звание из перечня' }).optional(),
    workplace: text(300).optional(),
    seniority: z.enum(SENIORITY, { message: 'Выберите стаж из перечня' }).optional(),
    services: z
      .array(z.enum(SERVICES, { message: 'Отметьте виды работ из перечня' }))
      .min(1, 'Отметьте хотя бы один вид работ, который готовы вести'),
    roles: z.array(z.enum(ROLES, { message: 'Отметьте опыт из перечня' })),
    elibrarySpin: text(20).optional(),
    orcid: text(60).optional(),
    weeklyHours: z.enum(WEEKLY_HOURS, { message: 'Выберите загрузку из перечня' }).optional(),
    consent: z.literal(true, { message: 'Без согласия на обработку данных анкету принять нельзя' }),
  })
  .superRefine((value, ctx) => {
    if (!looksLikeEmail(value.email)) {
      ctx.addIssue({ code: 'custom', path: ['email'], message: 'Проверьте адрес: он должен выглядеть как имя@домен' });
    }
    if (value.phone !== undefined && value.phone !== '' && !looksLikePhone(value.phone)) {
      ctx.addIssue({ code: 'custom', path: ['phone'], message: 'Проверьте номер: нужно от 10 до 15 цифр' });
    }
    if (value.elibrarySpin !== undefined && normalizeSpin(value.elibrarySpin) === null) {
      ctx.addIssue({ code: 'custom', path: ['elibrarySpin'], message: 'Проверьте SPIN-код: восемь цифр, например 1234-5678' });
    }
    if (value.orcid !== undefined && normalizeOrcid(value.orcid) === null) {
      ctx.addIssue({ code: 'custom', path: ['orcid'], message: 'Проверьте ORCID: шестнадцать знаков, например 0000-0002-1825-0097' });
    }
  });

export type ExpertApplicationInput = z.infer<typeof expertApplicationSchema>;

/** Отмеченные значения одного поля-набора: строки, без повторов. */
function picks(form: FormData, name: string): string[] {
  return [...new Set(form.getAll(name).filter((item): item is string => typeof item === 'string' && item.trim() !== '').map((item) => item.trim()))];
}

/** Поле формы — строкой; пустое и отсутствующее — `undefined`. */
function field(form: FormData, name: string): string | undefined {
  const value = form.get(name);
  if (typeof value !== 'string') return undefined;
  const trimmedValue = value.trim();
  return trimmedValue === '' ? undefined : trimmedValue;
}

/** Анкета из полей формы; ошибки — первой понятной фразой. */
export function parseExpertForm(form: FormData): ExpertApplicationInput {
  const parsed = expertApplicationSchema.safeParse({
    fullName: field(form, 'fullName') ?? '',
    email: field(form, 'email') ?? '',
    phone: field(form, 'phone'),
    degree: field(form, 'degree') ?? '',
    speciality: field(form, 'speciality'),
    fields: field(form, 'fields') ?? '',
    experience: field(form, 'experience') ?? '',
    links: field(form, 'links'),
    academicTitle: field(form, 'academicTitle'),
    workplace: field(form, 'workplace'),
    seniority: field(form, 'seniority'),
    services: picks(form, 'services'),
    roles: picks(form, 'roles'),
    elibrarySpin: field(form, 'elibrarySpin'),
    orcid: field(form, 'orcid'),
    weeklyHours: field(form, 'weeklyHours'),
    consent: form.get('consent') === 'on' || form.get('consent') === 'true',
  });
  if (!parsed.success) throw new ExpertInputError(parsed.error.issues[0]?.message ?? 'Проверьте поля анкеты');
  const data = parsed.data;
  return {
    ...data,
    elibrarySpin: data.elibrarySpin === undefined ? undefined : (normalizeSpin(data.elibrarySpin) ?? undefined),
    orcid: data.orcid === undefined ? undefined : (normalizeOrcid(data.orcid) ?? undefined),
  };
}

export interface ExpertFile {
  readonly originalName: string;
  readonly contentType: string;
  readonly body: Buffer;
}

/** Расширение файла — последнее, строчными. */
export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
}

/**
 * Файлы анкеты: число, размер, вид по расширению и по началу файла.
 * Пустое поле файла браузер присылает пустым файлом — такой пропускается.
 */
export async function expertFiles(form: FormData): Promise<ExpertFile[]> {
  const raw = form.getAll('files').filter((item): item is File => typeof item !== 'string' && item.size > 0);
  if (raw.length > FILES_MAX) throw new ExpertInputError(`Не больше ${FILES_MAX} файлов: резюме и до двух примеров работ`);
  const total = raw.reduce((acc, file) => acc + file.size, 0);
  if (total > FILES_TOTAL_MAX_BYTES) throw new ExpertInputError('Файлы вместе больше 20 МБ — уменьшите их или пришлите ссылкой', 413);
  const out: ExpertFile[] = [];
  for (const file of raw) {
    const name = file.name.slice(0, 200);
    if (file.size > FILE_MAX_BYTES) throw new ExpertInputError(`Файл «${name}» больше 10 МБ`, 413);
    const kind = FILE_KINDS[extensionOf(name)];
    if (kind === undefined) throw new ExpertInputError(`Файл «${name}» не принят: подходят ${FILE_HINT}`);
    const body = Buffer.from(await file.arrayBuffer());
    if (!kind.magic(body)) throw new ExpertInputError(`Файл «${name}» не похож на документ своего формата`);
    out.push({ originalName: name, contentType: kind.type, body });
  }
  return out;
}

export const EXPERT_STATUS_LABEL = {
  NEW: 'Новая',
  REVIEW: 'В разборе',
  INVITED: 'Приглашён',
  DECLINED: 'Отказ',
} as const;

export type ExpertStatus = keyof typeof EXPERT_STATUS_LABEL;
