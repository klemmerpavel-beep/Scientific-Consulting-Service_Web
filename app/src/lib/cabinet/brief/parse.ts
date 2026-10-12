/**
 * Разбор документа «Метка: значение» и предпроверка (задание владельца
 * 12.10.2026, решение Р-553).
 *
 * Правила выведены из образцов «исходных данных на утверждение», которые
 * прислал владелец, и проверены прототипом на всех четырёх:
 * - метка — начало строки по синониму поля, без учёта регистра и «ё/е»,
 *   с номером «N.» впереди или без; разделитель — двоеточие, тире, дефис
 *   или ничего («1. Тема статьи Алгоритм …»);
 * - строка считается меткой, если у неё есть разделитель, номер или она не
 *   длиннее 60 знаков; иначе это текст абзаца («Актуальность темы
 *   обусловлена …» — не метка «Актуальность»);
 * - раздел (задачи, план, источники) — строки до следующей метки;
 * - внутри плана короткие «Введение», «Заключение», «Список …» — пункты
 *   плана; план кончается на метке с двоеточием или номером либо на
 *   сплошном абзаце длиннее 200 знаков, и короткая строка перед таким
 *   абзацем — заголовок нового раздела;
 * - «Вариант N.» открывает вариант темы: тема, цель и задачи после него
 *   относятся к варианту, шапка — общая.
 *
 * Предпроверка называет то, что человек должен поправить до утверждения;
 * это замечания, а не запрет. Каждое правило найдено в образцах.
 */

import { BRIEF_FIELDS, briefField, type BriefFieldKey } from './fields.ts';
import type { BriefLine } from './read.ts';

/** Поля варианта темы: остальные — общая шапка. */
const VARIANT_KEYS: ReadonlySet<BriefFieldKey> = new Set(['topic', 'goal', 'tasks']);

export interface BriefVariant {
  /** Подпись варианта, как в документе: «Вариант 1. Модернизация …». */
  readonly label: string;
  readonly fields: Partial<Record<BriefFieldKey, string>>;
}

export interface ParsedBrief {
  /** Общая шапка и, если вариант один, его поля. */
  readonly fields: Partial<Record<BriefFieldKey, string>>;
  /** Варианты темы: пусто, если документ без вариантов. */
  readonly variants: readonly BriefVariant[];
  /** Предпроверка: что поправить до утверждения. */
  readonly issues: readonly string[];
  /** Что не перенесено и требует руки: «Проверьте вручную». */
  readonly manual: readonly string[];
  /** Документ устроен как статья: метки «Тема статьи», «Структура статьи». */
  readonly article: boolean;
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/ё/gu, 'е').replace(/\s+/gu, ' ').trim();
}

interface LabelMatch {
  readonly key: BriefFieldKey;
  /** Остаток строки после метки — значение. */
  readonly value: string;
  /** Подсказка шаблона в скобках сразу за меткой. */
  readonly hint: string | null;
  /** Метка с двоеточием или номером: закрывает план. */
  readonly explicit: boolean;
  /** Синоним, по которому узнана метка. */
  readonly synonym: string;
  /** Есть разделитель: двоеточие, тире, дефис. */
  readonly separator: boolean;
}

const HINT = /^\(\d+\s*[–—-]\s*\d+\s+\S+\)$/u;

/**
 * Синонимы всех полей от длинного к короткому: «тема работы» проверяется
 * раньше «тема», «фио руководителя» — раньше «фио», и порядок перечня
 * полей на это не влияет.
 */
const SYNONYMS = BRIEF_FIELDS.flatMap((item) => item.synonyms.map((synonym) => ({ item, synonym }))).sort(
  (a, b) => b.synonym.length - a.synonym.length,
);

/** Строка — метка поля? */
export function matchLabel(line: string): LabelMatch | null {
  // Пробелы сведены заранее, чтобы позиции в строке и в её нижнем
  // регистре совпадали: значение берётся из исходного написания.
  const clean = line.replace(/\s+/gu, ' ').trim();
  const lower = clean.toLowerCase().replace(/ё/gu, 'е');
  const numbered = /^\d+[.)]\s*/u.exec(lower);
  const from = numbered === null ? 0 : numbered[0].length;
  const rest = lower.slice(from);
  for (const { item, synonym } of SYNONYMS) {
    {
      if (!rest.startsWith(synonym)) continue;
      const after = rest.slice(synonym.length);
      // Синоним — целое слово: «тема» не ловит «тематику».
      if (/^[\p{L}\p{N}]/u.test(after)) continue;
      const tail = /^\s*(\([^)]*\))?\s*([:—–-])?\s*/u.exec(after)!;
      const separator = tail[2] !== undefined;
      if (!separator && numbered === null && clean.length > 60) return null;
      const value = clean.slice(from + synonym.length + tail[0].length).trim();
      const hint = tail[1] !== undefined && HINT.test(tail[1]) ? tail[1] : null;
      return { key: item.key, value, hint, explicit: separator || numbered !== null, synonym, separator };
    }
  }
  return null;
}

/** Ссылки вида [3], [1, 2], [5–7] — наибольший номер. */
function maxCitation(text: string): number {
  let max = 0;
  for (const match of text.matchAll(/\[(\d+(?:\s*[,–—-]\s*\d+)*)\]/gu)) {
    for (const number of match[1]!.split(/[,–—-]/u)) max = Math.max(max, Number(number.trim()));
  }
  return max;
}

export function parseBrief(lines: readonly BriefLine[]): ParsedBrief {
  const common: Partial<Record<BriefFieldKey, string[]>> = {};
  const variants: { label: string; title: string; fields: Partial<Record<BriefFieldKey, string[]>> }[] = [];
  let article = false;
  const issues: string[] = [];
  const manual: string[] = [];
  const seen = new Set<BriefFieldKey>();
  let current: BriefFieldKey | null = null;
  /** Поле строки без значения ждёт значение следующей строкой. */
  let awaiting: BriefFieldKey | null = null;
  let planOpen = false;
  let allText = '';

  const bucket = (key: BriefFieldKey) => {
    const target = VARIANT_KEYS.has(key) && variants.length > 0 ? variants[variants.length - 1]!.fields : common;
    return (target[key] ??= []);
  };
  const open = (key: BriefFieldKey, label: string, value: string, cell = false) => {
    const item = briefField(key);
    // Повтор раздела в одном варианте — дефект образца (два блока «Задачи
    // работы» подряд).
    if (item.kind === 'section' && seen.has(key) && !(VARIANT_KEYS.has(key) && variants.length > 0 && bucket(key).length === 0)) {
      issues.push(`Раздел повторяется: «${label.slice(0, 40)}».`);
    }
    seen.add(key);
    current = item.kind === 'section' ? key : null;
    // У строки таблицы значение — во второй ячейке, даже пустой: следующая
    // строка документа ему не принадлежит.
    awaiting = item.kind === 'line' && value === '' && !cell ? key : null;
    planOpen = key === 'plan';
    if (value === '') return;
    // Абзацы ячейки раздела — отдельные пункты: задачи в ячейке шаблона.
    if (item.kind === 'section') bucket(key).push(...value.split('\n').map((part) => part.trim()).filter((part) => part !== ''));
    else bucket(key).push(value.replace(/\s*\n\s*/gu, ' '));
  };

  for (const line of lines) {
    const text = line.text.trim();
    if (text === '') continue;
    allText += `${text}\n`;

    if (/\[(?:file content|end of file|конец файла)[^\]]*\]/iu.test(text)) {
      issues.push(`Служебный след в тексте: «${text.slice(0, 40)}».`);
      continue;
    }
    const glued = /\S{0,12}[а-яё]\d+\.\d+\./iu.exec(text);
    if (glued !== null) issues.push(`Склеенные пункты: «…${glued[0]}».`);

    const variant = /^вариант\s+(\d+)\s*[.:)]?\s*/iu.exec(text);
    if (variant !== null) {
      // «Вариант 1. Модернизация …» — остаток строки: название варианта и
      // тема, если отдельной метки «Тема» у варианта нет.
      variants.push({ label: text, title: text.slice(variant[0].length).trim(), fields: {} });
      current = null;
      awaiting = null;
      planOpen = false;
      continue;
    }

    // Строка таблицы «метка — значение»: ячейки разбираются напрямую.
    const match = line.cells !== undefined ? matchLabel(`${line.cells[0]}:`) : matchLabel(text);
    // У заголовка раздела без разделителя остаток строки — продолжение
    // заголовка, а не содержимое: «Список источников литературы для
    // Главы 1.», «Примерные результаты (из основной работы)».
    const headingOnly = match !== null && line.cells === undefined && !match.separator && briefField(match.key).kind === 'section';
    const value = line.cells !== undefined ? line.cells[1] : headingOnly ? '' : (match?.value ?? '');

    if (planOpen) {
      // Внутри плана «Введение», «Заключение», «Список…» — пункты плана.
      const planItem = text.length <= 200 && (match === null || (['introduction', 'sources', 'relevance'].includes(match.key) && !match.explicit));
      if (planItem) {
        bucket('plan').push(text);
        continue;
      }
      planOpen = false;
      current = null;
      // Сплошной абзац закрыл план: короткая строка перед ним — заголовок.
      const plan = bucket('plan');
      const lastLine = plan.length === 0 ? null : plan[plan.length - 1]!;
      const last = lastLine === null ? null : matchLabel(lastLine);
      if (match === null && last !== null && lastLine !== null && briefField(last.key).kind === 'section') {
        plan.pop();
        open(last.key, lastLine, '');
        bucket(last.key).push(text);
        continue;
      }
    }

    if (match !== null) {
      if (match.synonym.includes('стать')) article = true;
      if (match.hint !== null) issues.push(`Подсказка шаблона осталась в тексте: «${match.hint}».`);
      open(match.key, text, value, line.cells !== undefined);
      continue;
    }
    if (awaiting !== null) {
      bucket(awaiting).push(text);
      awaiting = null;
      continue;
    }
    if (current !== null) bucket(current).push(text);
  }

  // ── Предпроверка по сводке ─────────────────────────────────────────────
  if (variants.length === 1) issues.push(`Одиночная метка «${variants[0]!.label.slice(0, 20)}»: вариант один — метку убрать.`);
  for (const key of ['customer', 'supervisor'] as const) {
    if (seen.has(key) && (common[key] ?? []).join('').trim() === '') issues.push(`Не заполнено: «${briefField(key).label}».`);
  }
  if ((common.introduction ?? []).some((paragraph) => paragraph.length > 300)) {
    issues.push('Введение — сплошным текстом: в исходных данных нужны тезисы для согласования.');
  }
  const sources = (common.sources ?? []).filter((item) => item.trim() !== '').length;
  const cited = maxCitation(allText);
  if (sources > 0 && cited > sources) issues.push(`Ссылка [${cited}] при ${sources} источниках в списке.`);

  // ── Сборка значений с пределами ────────────────────────────────────────
  const assemble = (source: Partial<Record<BriefFieldKey, string[]>>, prefix: string) => {
    const out: Partial<Record<BriefFieldKey, string>> = {};
    for (const [key, parts] of Object.entries(source) as [BriefFieldKey, string[]][]) {
      const item = briefField(key);
      const value =
        key === 'tasks'
          ? parts.map((part, index) => (/^\d+[.)]\s/u.test(part) ? part : `${index + 1}. ${part}`)).join('\n')
          : parts.join(item.kind === 'section' ? '\n' : ' ').trim();
      if (value === '') continue;
      if (value.length > item.limit) {
        manual.push(`${prefix}«${item.label}» длиннее ${item.limit} знаков — перенесите вручную.`);
        continue;
      }
      out[key] = value;
    }
    return out;
  };

  const fields = assemble(common, '');
  const parsedVariants = variants.map((variant, index) => {
    const own = assemble(variant.fields, `Вариант ${index + 1}: `);
    if (own.topic === undefined && variant.title !== '' && variant.title.length <= briefField('topic').limit) own.topic = variant.title;
    return { label: variant.label, fields: own };
  });
  // Один вариант — его поля и есть поля документа.
  if (parsedVariants.length === 1) Object.assign(fields, parsedVariants[0]!.fields);
  return { fields, variants: parsedVariants.length > 1 ? parsedVariants : [], issues: [...new Set(issues)], manual, article };
}

/**
 * Вид сопровождения по тексту документа — подсказка, когда метки «Вид
 * работы» нет. Коды — справочника (`service-checklists.ts`).
 */
export function guessServiceCode(brief: Pick<ParsedBrief, 'fields' | 'article'>): string | null {
  const { fields } = brief;
  const text = normalize([fields.serviceType, fields.title, fields.topic].filter(Boolean).join(' '));
  if (/диссертац/u.test(text)) return 'dissertation';
  if (/аспирант/u.test(text)) return 'postgrad';
  if (/стать|публикац|патент/u.test(text) || brief.article || fields.journal !== undefined) return 'article';
  if (/\bнир\b|ниокр|отч[её]т о нир/u.test(text)) return 'research';
  if (/вкр|диплом|выпускн|магистр|бакалавр/u.test(text) || /\b\d{2}\.0[345]\.\d{2}\b/u.test(fields.direction ?? '')) return 'diploma';
  return null;
}
