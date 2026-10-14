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
 * странице. Пишется в анкету: по ней видно, с каким текстом согласился
 * человек. Меняется вместе с текстом согласия в макете.
 */
export const EXPERT_CONSENT_VERSION = '2026-10-14';

/** Учёная степень — выбор из четырёх, чтобы анкеты сравнивались. */
export const DEGREES = ['Без степени', 'Кандидат наук', 'Доктор наук', 'PhD'] as const;

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
    consent: z.literal(true, { message: 'Без согласия на обработку данных анкету принять нельзя' }),
  })
  .superRefine((value, ctx) => {
    if (!looksLikeEmail(value.email)) {
      ctx.addIssue({ code: 'custom', path: ['email'], message: 'Проверьте адрес: он должен выглядеть как имя@домен' });
    }
    if (value.phone !== undefined && value.phone !== '' && !looksLikePhone(value.phone)) {
      ctx.addIssue({ code: 'custom', path: ['phone'], message: 'Проверьте номер: нужно от 10 до 15 цифр' });
    }
  });

export type ExpertApplicationInput = z.infer<typeof expertApplicationSchema>;

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
    consent: form.get('consent') === 'on' || form.get('consent') === 'true',
  });
  if (!parsed.success) throw new ExpertInputError(parsed.error.issues[0]?.message ?? 'Проверьте поля анкеты');
  return parsed.data;
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
