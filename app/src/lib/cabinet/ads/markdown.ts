/**
 * Разбор документов папки `marketing/` для показа в кабинете (решение
 * Р-550).
 *
 * Документы пишутся в Markdown, и кабинет показывает их руководителю как
 * есть, без перехода на GitHub. Библиотеки разбора не подключаются
 * (`CONTRIBUTING.md`: зависимость — только отдельным решением), а
 * HTML из текста не собирается вовсе: разбор отдаёт дерево блоков, и
 * разметку строит React, экранируя текст сам. Поддержан тот набор, которым
 * пишутся документы папки: заголовки, абзацы, списки, таблицы, цитаты,
 * блоки кода, черта; в строке — жирный, курсив, зачёркнутый, код, ссылка.
 */

export type Inline =
  | { readonly t: 'text'; readonly v: string }
  | { readonly t: 'strong'; readonly v: string }
  | { readonly t: 'em'; readonly v: string }
  | { readonly t: 'strike'; readonly v: string }
  | { readonly t: 'code'; readonly v: string }
  | { readonly t: 'link'; readonly v: string; readonly href: string };

export interface ListItem {
  readonly depth: number;
  readonly ordered: boolean;
  readonly inlines: readonly Inline[];
}

export type Block =
  | { readonly kind: 'heading'; readonly level: number; readonly inlines: readonly Inline[] }
  | { readonly kind: 'paragraph'; readonly inlines: readonly Inline[] }
  | { readonly kind: 'list'; readonly items: readonly ListItem[] }
  | { readonly kind: 'table'; readonly head: readonly (readonly Inline[])[]; readonly rows: readonly (readonly (readonly Inline[])[])[] }
  | { readonly kind: 'quote'; readonly inlines: readonly Inline[] }
  | { readonly kind: 'code'; readonly text: string }
  | { readonly kind: 'rule' };

const INLINE = /(`[^`]+`)|(\*\*[^*]+\*\*)|(~~[^~]+~~)|(\[[^\]]+\]\([^)\s]+\))|(\*[^*\s][^*]*\*)/gu;

/** Строка с разметкой внутри строки. */
export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    const at = match.index ?? 0;
    if (at > last) out.push({ t: 'text', v: text.slice(last, at) });
    const token = match[0];
    if (match[1] !== undefined) out.push({ t: 'code', v: token.slice(1, -1) });
    else if (match[2] !== undefined) out.push({ t: 'strong', v: token.slice(2, -2) });
    else if (match[3] !== undefined) out.push({ t: 'strike', v: token.slice(2, -2) });
    else if (match[4] !== undefined) {
      const close = token.indexOf('](');
      out.push({ t: 'link', v: token.slice(1, close), href: token.slice(close + 2, -1) });
    } else out.push({ t: 'em', v: token.slice(1, -1) });
    last = at + token.length;
  }
  if (last < text.length) out.push({ t: 'text', v: text.slice(last) });
  return out;
}

const HEADING = /^(#{1,6})\s+(.*)$/u;
const RULE = /^\s*(?:-{3,}|\*{3,})\s*$/u;
const ITEM = /^(\s*)([-*]|\d+\.)\s+(.*)$/u;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)*\|?\s*$/u;

function cells(line: string): Inline[][] {
  const trimmed = line.trim().replace(/^\|/u, '').replace(/\|$/u, '');
  return trimmed.split('|').map((cell) => parseInline(cell.trim()));
}

/** Документ целиком — последовательность блоков. */
export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n?/gu, '\n').split('\n');
  const blocks: Block[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? '';

    if (line.trim() === '') {
      index += 1;
      continue;
    }

    if (line.trimStart().startsWith('```')) {
      const body: string[] = [];
      index += 1;
      while (index < lines.length && !(lines[index] ?? '').trimStart().startsWith('```')) {
        body.push(lines[index] ?? '');
        index += 1;
      }
      index += 1;
      blocks.push({ kind: 'code', text: body.join('\n') });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading !== null) {
      blocks.push({ kind: 'heading', level: heading[1]!.length, inlines: parseInline(heading[2]!.trim()) });
      index += 1;
      continue;
    }

    if (RULE.test(line)) {
      blocks.push({ kind: 'rule' });
      index += 1;
      continue;
    }

    if (line.trimStart().startsWith('|') && TABLE_SEPARATOR.test(lines[index + 1] ?? '')) {
      const head = cells(line);
      const rows: Inline[][][] = [];
      index += 2;
      while (index < lines.length && (lines[index] ?? '').trimStart().startsWith('|')) {
        rows.push(cells(lines[index] ?? ''));
        index += 1;
      }
      blocks.push({ kind: 'table', head, rows });
      continue;
    }

    if (line.trimStart().startsWith('>')) {
      const body: string[] = [];
      while (index < lines.length && (lines[index] ?? '').trimStart().startsWith('>')) {
        body.push((lines[index] ?? '').trimStart().replace(/^>\s?/u, ''));
        index += 1;
      }
      blocks.push({ kind: 'quote', inlines: parseInline(body.join(' ').trim()) });
      continue;
    }

    if (ITEM.test(line)) {
      const items: { depth: number; ordered: boolean; text: string }[] = [];
      while (index < lines.length) {
        const current = lines[index] ?? '';
        if (current.trim() === '') {
          // Пустая строка внутри списка не рвёт его, если дальше снова пункт.
          if (ITEM.test(lines[index + 1] ?? '')) {
            index += 1;
            continue;
          }
          break;
        }
        const item = ITEM.exec(current);
        if (item !== null) {
          items.push({
            depth: Math.floor(item[1]!.replace(/\t/gu, '  ').length / 2),
            ordered: /\d/u.test(item[2]!),
            text: item[3]!.trim(),
          });
        } else if (/^\s+\S/u.test(current) && items.length > 0) {
          // Продолжение пункта на следующей строке с отступом.
          const previous = items[items.length - 1]!;
          previous.text = `${previous.text} ${current.trim()}`;
        } else {
          break;
        }
        index += 1;
      }
      blocks.push({
        kind: 'list',
        items: items.map((item) => ({ depth: item.depth, ordered: item.ordered, inlines: parseInline(item.text) })),
      });
      continue;
    }

    const body: string[] = [];
    while (index < lines.length) {
      const current = lines[index] ?? '';
      if (
        current.trim() === '' ||
        HEADING.test(current) ||
        RULE.test(current) ||
        ITEM.test(current) ||
        current.trimStart().startsWith('```') ||
        current.trimStart().startsWith('>') ||
        (current.trimStart().startsWith('|') && TABLE_SEPARATOR.test(lines[index + 1] ?? ''))
      ) {
        break;
      }
      body.push(current.trim());
      index += 1;
    }
    blocks.push({ kind: 'paragraph', inlines: parseInline(body.join(' ')) });
  }

  return blocks;
}

/** Внешняя ссылка, которую можно показать как ссылку: только http и https. */
export function isExternal(href: string): boolean {
  return /^https?:\/\/[^\s]+$/iu.test(href);
}
