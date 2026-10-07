/**
 * Заголовок `Content-Disposition` для выдачи файла вложением (решение
 * Р-432).
 *
 * Имя кодируется по RFC 8187: `encodeURIComponent` оставляет как есть
 * апостроф, скобки, звёздочку и восклицательный знак, а апостроф в
 * `filename*` — разделитель кодировки и языка. «Отзыв на главу (2).docx»
 * или «O'Brien.pdf» приходили к части браузеров с обрезанным или чужим
 * именем. Рядом — запасное имя `filename` латиницей для клиентов без
 * поддержки `filename*`: кавычки, обратная косая и управляющие знаки
 * из него убраны, остальное вне ASCII заменено подчёркиванием.
 */
export function attachmentDisposition(name: string, ascii?: string): string {
  const encoded = encodeURIComponent(name).replace(
    /[!'()*]/gu,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  const fallback = (ascii ?? name).replace(/[^\x20-\x7e]/gu, '_').replace(/["\\]/gu, '_') || 'file';
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
