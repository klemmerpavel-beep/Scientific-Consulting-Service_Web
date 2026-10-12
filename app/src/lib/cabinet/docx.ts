/**
 * Документ Word из кода: шаблоны и выгрузки чек-листов (решения Р-557 и
 * Р-558).
 *
 * Без сторонних библиотек (CONTRIBUTING, п. 5): документ — пять частей
 * OOXML, архив — тот же детерминированный `zip`, что у книги Excel для
 * зеркала на Диске. Одинаковый вход даёт побайтно одинаковый файл: дата в
 * архиве постоянна, автора в свойствах нет (Р-396 — имя в свойствах файла
 * выдаёт, кто его готовил).
 */

import { zip } from '../disk/xlsx.ts';

export type DocBlock =
  | { readonly kind: 'title'; readonly text: string }
  | { readonly kind: 'heading'; readonly text: string }
  | { readonly kind: 'paragraph'; readonly text: string; readonly muted?: boolean }
  /** Пункт с пустым квадратом для отметки ручкой. */
  | { readonly kind: 'check'; readonly text: string }
  /** Таблица: первая колонка — подпись, жирным. */
  | { readonly kind: 'table'; readonly rows: readonly (readonly string[])[] };

function escapeXml(text: string): string {
  return text
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/gu, '')
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;');
}

function run(text: string, props = ''): string {
  return `<w:r>${props === '' ? '' : `<w:rPr>${props}</w:rPr>`}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;
}

function paragraph(text: string, style: string | null, props = ''): string {
  const pPr = style === null ? '' : `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>`;
  return `<w:p>${pPr}${text === '' ? '' : run(text, props)}</w:p>`;
}

function table(rows: readonly (readonly string[])[]): string {
  const columns = Math.max(...rows.map((row) => row.length), 1);
  const width = Math.floor(9600 / columns);
  const grid = Array.from({ length: columns }, (_, index) => `<w:gridCol w:w="${index === 0 && columns === 2 ? 3600 : width}"/>`).join('');
  const body = rows
    .map(
      (row) =>
        `<w:tr>${Array.from({ length: columns }, (_, index) => {
          const text = row[index] ?? '';
          const cellWidth = index === 0 && columns === 2 ? 3600 : columns === 2 ? 6000 : width;
          return `<w:tc><w:tcPr><w:tcW w:w="${cellWidth}" w:type="dxa"/></w:tcPr>${paragraph(text, null, index === 0 ? '<w:b/>' : '')}</w:tc>`;
        }).join('')}</w:tr>`,
    )
    .join('');
  const border = '<w:top w:val="single" w:sz="4" w:color="999999"/><w:left w:val="single" w:sz="4" w:color="999999"/><w:bottom w:val="single" w:sz="4" w:color="999999"/><w:right w:val="single" w:sz="4" w:color="999999"/><w:insideH w:val="single" w:sz="4" w:color="999999"/><w:insideV w:val="single" w:sz="4" w:color="999999"/>';
  return `<w:tbl><w:tblPr><w:tblW w:w="9600" w:type="dxa"/><w:tblBorders>${border}</w:tblBorders><w:tblCellMar><w:top w:w="60" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${body}</w:tbl>${paragraph('', null)}`;
}

function blockXml(block: DocBlock): string {
  switch (block.kind) {
    case 'title':
      return paragraph(block.text, 'Title');
    case 'heading':
      return paragraph(block.text, 'Heading1');
    case 'paragraph':
      return paragraph(block.text, block.muted === true ? 'Note' : null);
    case 'check':
      return paragraph(`☐ ${block.text}`, 'Check');
    case 'table':
      return table(block.rows);
  }
}

const CONTENT_TYPES =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
  '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
  '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
  '</Types>';

const ROOT_RELS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
  '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
  '</Relationships>';

const DOCUMENT_RELS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
  '</Relationships>';

/** Стили: Times New Roman 12 — как у научных текстов, которые практика сопровождает. */
const STYLES =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
  '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman" w:eastAsia="Times New Roman"/><w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="ru-RU"/></w:rPr></w:rPrDefault>' +
  '<w:pPrDefault><w:pPr><w:spacing w:after="80" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
  '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>' +
  '<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="200"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style>' +
  '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="80"/></w:pPr><w:rPr><w:b/><w:sz w:val="26"/></w:rPr></w:style>' +
  '<w:style w:type="paragraph" w:styleId="Note"><w:name w:val="Note"/><w:basedOn w:val="Normal"/><w:rPr><w:i/><w:color w:val="555555"/><w:sz w:val="22"/></w:rPr></w:style>' +
  '<w:style w:type="paragraph" w:styleId="Check"><w:name w:val="Check"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="360" w:hanging="360"/></w:pPr></w:style>' +
  '</w:styles>';

function coreXml(title: string): string {
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">' +
    `<dc:title>${escapeXml(title)}</dc:title><dc:creator></dc:creator><cp:lastModifiedBy></cp:lastModifiedBy>` +
    '</cp:coreProperties>'
  );
}

/** Документ Word из блоков; свойства файла — только название. */
export function docx(title: string, blocks: readonly DocBlock[]): Buffer {
  const body = blocks.map(blockXml).join('');
  const document =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
    body +
    '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="850" w:bottom="1134" w:left="1701" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr>' +
    '</w:body></w:document>';
  const utf8 = (text: string) => Buffer.from(text, 'utf8');
  return zip([
    ['[Content_Types].xml', utf8(CONTENT_TYPES)],
    ['_rels/.rels', utf8(ROOT_RELS)],
    ['word/document.xml', utf8(document)],
    ['word/_rels/document.xml.rels', utf8(DOCUMENT_RELS)],
    ['word/styles.xml', utf8(STYLES)],
    ['docProps/core.xml', utf8(coreXml(title))],
  ]);
}
