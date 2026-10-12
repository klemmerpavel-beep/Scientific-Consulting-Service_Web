import { Fragment } from 'react';
import type { ReactNode } from 'react';

import { MONO, RADIUS, SANS } from './tokens.ts';
import { Heading, TABLE_CELL, TABLE_HEAD, TableScroll, Text } from './ui.tsx';
import { docByPath, type AdsDoc } from '../../lib/cabinet/ads/registry';
import { isExternal, parseMarkdown, type Inline } from '../../lib/cabinet/ads/markdown';

/** Адрес документа рекламы в кабинете. */
export function adsDocHref(slug: string): string {
  return `/cabinet/manage/ads/doc/${slug}`;
}

const LINK = { color: 'var(--pd-accent)', textDecoration: 'underline', textUnderlineOffset: 3 } as const;

/**
 * Ссылка в ячейке таблицы и в пункте списка — не строчная в предложении, а
 * самостоятельная цель нажатия: имя репозитория, документ. Высотой в строку
 * (17–38 px) она не дотягивала до 44 px; отступ сверху и снизу добирает
 * цель, не меняя строки — как у ссылок в подписи согласия (Р-253, Р-567).
 */
const TARGET_LINK = { ...LINK, padding: '14px 0' } as const;

function Inlines({
  items,
  doc,
  docs,
  standalone = false,
}: {
  items: readonly Inline[];
  doc: AdsDoc;
  docs: readonly AdsDoc[];
  /** Ячейка таблицы или пункт списка: ссылкам — цель 44 px. */
  standalone?: boolean;
}) {
  const linkStyle = standalone ? TARGET_LINK : LINK;
  return (
    <>
      {items.map((item, index) => {
        switch (item.t) {
          case 'strong':
            return (
              <strong key={index} style={{ fontWeight: 600, color: 'var(--pd-ink)' }}>
                {item.v}
              </strong>
            );
          case 'em':
            return <em key={index}>{item.v}</em>;
          case 'strike':
            return <s key={index}>{item.v}</s>;
          case 'code':
            return (
              <code
                key={index}
                style={{
                  fontFamily: MONO,
                  fontSize: '0.88em',
                  padding: '1px 5px',
                  borderRadius: RADIUS.mark,
                  background: 'var(--pd-surface-quiet)',
                  overflowWrap: 'anywhere',
                }}
              >
                {item.v}
              </code>
            );
          case 'link': {
            // Ссылка на другой документ папки ведёт на его экран в кабинете;
            // внешняя — в новой вкладке; прочее остаётся текстом.
            const target = docByPath(docs, doc.path, item.href);
            if (target !== null) {
              return target.external === null ? (
                <a key={index} href={adsDocHref(target.slug)} style={linkStyle}>
                  {item.v}
                </a>
              ) : (
                <a key={index} href={target.external} target="_blank" rel="noopener noreferrer" style={linkStyle}>
                  {item.v}
                </a>
              );
            }
            if (isExternal(item.href)) {
              return (
                <a key={index} href={item.href} target="_blank" rel="noopener noreferrer" style={linkStyle}>
                  {item.v}
                </a>
              );
            }
            return <Fragment key={index}>{item.v}</Fragment>;
          }
          default:
            return <Fragment key={index}>{item.v}</Fragment>;
        }
      })}
    </>
  );
}

/**
 * Документ папки `marketing/` на экране кабинета (решение Р-550). Разметку
 * строит React по дереву блоков: HTML из текста документа не вставляется.
 * Заголовок первого уровня документа не повторяется — его несёт шапка.
 */
export default function AdsDocument({ doc, docs }: { doc: AdsDoc; docs: readonly AdsDoc[] }) {
  const blocks = parseMarkdown(doc.markdown);
  const first = blocks.findIndex((block) => block.kind === 'heading' && block.level === 1);
  const body = first === 0 ? blocks.slice(1) : blocks;
  const inline = (items: readonly Inline[]) => <Inlines items={items} doc={doc} docs={docs} />;
  const cell = (items: readonly Inline[]) => <Inlines items={items} doc={doc} docs={docs} standalone />;

  // Колонка сетки — не шире экрана: без `minmax(0, 1fr)` она растягивалась
  // по самой широкой таблице, и прокручивалась вся страница, а не область
  // таблицы (Р-567).
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 14, fontFamily: SANS }}>
      {body.map((block, index): ReactNode => {
        switch (block.kind) {
          case 'heading':
            return block.level <= 2 ? (
              <Heading key={index} level={2} style={{ marginTop: 18 }}>
                {inline(block.inlines)}
              </Heading>
            ) : (
              <Heading key={index} level={3} size={3} style={{ marginTop: 10 }}>
                {inline(block.inlines)}
              </Heading>
            );
          case 'paragraph':
            return <Text key={index}>{inline(block.inlines)}</Text>;
          case 'quote':
            return (
              <div
                key={index}
                style={{ borderLeft: '3px solid var(--pd-accent-edge)', padding: '4px 0 4px 16px' }}
              >
                <Text>{inline(block.inlines)}</Text>
              </div>
            );
          case 'rule':
            return <hr key={index} style={{ border: 0, borderTop: '1px solid var(--pd-divider)', margin: '8px 0' }} />;
          case 'code':
            return (
              <pre
                key={index}
                style={{
                  margin: 0,
                  padding: '14px 16px',
                  borderRadius: RADIUS.field,
                  background: 'var(--pd-surface-quiet)',
                  fontFamily: MONO,
                  fontSize: 13,
                  lineHeight: 1.6,
                  color: 'var(--pd-ink-secondary)',
                  whiteSpace: 'pre-wrap',
                  overflowWrap: 'anywhere',
                }}
              >
                {block.text}
              </pre>
            );
          case 'list': {
            const ordered = block.items[0]?.ordered ?? false;
            const Tag = ordered ? 'ol' : 'ul';
            return (
              <Tag key={index} style={{ margin: 0, paddingLeft: 22, display: 'grid', gap: 6 }}>
                {block.items.map((item, at) => (
                  <li
                    key={at}
                    style={{
                      marginLeft: item.depth * 20,
                      fontSize: 15,
                      lineHeight: 1.6,
                      color: 'var(--pd-ink-secondary)',
                    }}
                  >
                    {cell(item.inlines)}
                  </li>
                ))}
              </Tag>
            );
          }
          case 'table':
            return (
              <TableScroll key={index} label="Таблица документа">
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {block.head.map((value, at) => (
                        <th key={at} scope="col" style={{ ...TABLE_HEAD, whiteSpace: 'normal' }}>
                          {cell(value)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, at) => (
                      <tr key={at}>
                        {row.map((value, col) => (
                          <td key={col} style={TABLE_CELL}>
                            {cell(value)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScroll>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
