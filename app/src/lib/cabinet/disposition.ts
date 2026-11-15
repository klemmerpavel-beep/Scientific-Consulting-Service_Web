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
/**
 * Тип, с которым содержимое уходит в браузер (решения Р-165, Р-902).
 *
 * Тип задаёт тот, кто загрузил файл, и разметка, картинка с разметкой
 * внутри или таблица стилей, отданные своим типом, исполняются в границах
 * домена. Выдача и так идёт вложением, а заголовки сайта запрещают
 * угадывание типа, но полагаться на одно средство незачем: опасные типы
 * заменяются нейтральным, файл от этого не портится. Прежде правило стояло
 * у материалов и вложений заявок, а шаблоны практики, файлы анкет и снимки
 * замечаний отдавались присланным типом. Тип со знаками вне печатного
 * ASCII в заголовок не ставится вовсе.
 */
const RISKY_TYPE =
  /^\s*(text\/html|image\/svg|application\/xhtml|text\/xml|application\/xml|text\/css|application\/javascript|text\/javascript|application\/x-javascript|application\/ecmascript|text\/ecmascript)/iu;

export function safeContentType(contentType: string | null | undefined): string {
  const type = (contentType ?? '').trim();
  if (type === '' || /[^\x20-\x7e]/u.test(type) || RISKY_TYPE.test(type)) return 'application/octet-stream';
  return type;
}

export function attachmentDisposition(name: string, ascii?: string): string {
  const encoded = encodeURIComponent(name).replace(
    /[!'()*]/gu,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  const fallback = (ascii ?? name).replace(/[^\x20-\x7e]/gu, '_').replace(/["\\]/gu, '_') || 'file';
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
