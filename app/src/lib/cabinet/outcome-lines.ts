/**
 * Строка исхода после действия с последствиями (решение Р-725; общий блок
 * исхода `Outcome` — Р-253, отклик на действие — Р-43, спокойный тон —
 * Р-146).
 *
 * Прежде после «Согласовать этап», перевода этапа на согласование,
 * «Опубликовать клиенту», переноса срока, одобрения заявки и «Нового
 * заказа» экран перезагружался молча: форма исчезала, и это читалось как
 * сбой — человек нажимал снова или уходил проверять. Теперь действие
 * возвращает на экран с признаком в адресе, экран говорит одной строкой,
 * что произошло и что дальше, и признак показывается один раз.
 *
 * Строка не обещает письма, которого не будет (Р-163, Р-267): судьба
 * уведомления берётся из очереди уведомлений и настройки каналов. Клиенту
 * строка не называет сотрудников по имени.
 *
 * Модуль чистый: проверяется встроенным `node --test` без базы.
 */

/** Признаки исхода в адресе: экран показывает строку и убирает их из адреса. */
export const OUTCOME_FLAGS = ['done', 'published', 'created'] as const;

/**
 * Якорь строки исхода: окно открывается на ней. Имя не совпадает ни с
 * одним полем экранов, где стоит строка: якорь `outcome` совпадал с полем
 * «Итог этапа» (`name="outcome"` — `id="outcome"`) на экране этапа — на
 * странице было два одинаковых `id`, подпись теряла поле, а обновление
 * страницы с якорем в адресе раскрывало «Поправить итог этапа» и уводило
 * окно к полю (решение Р-725).
 */
export const OUTCOME_ANCHOR = 'action-outcome';

/**
 * Окно, в котором признак исхода подтверждается данными: действие сделано
 * не раньше часа назад. Признак, подставленный в адрес руками или
 * оставшийся в старой ссылке, строки не даёт — у данных нет свежего
 * события (решение Р-725). Строки очереди уведомлений берутся из того
 * же окна.
 */
export const OUTCOME_WINDOW_MS = 60 * 60 * 1000;

/**
 * Начало окна исхода. Часы — настоящие, не `CABINET_NOW`: моменты
 * действий и строк очереди пишет база по настоящему времени (Р-205).
 */
export function outcomeSince(at: Date = new Date()): Date {
  return new Date(at.getTime() - OUTCOME_WINDOW_MS);
}

/** Момент действия — в окне исхода. */
export function inOutcomeWindow(moment: Date | null | undefined, at: Date = new Date()): boolean {
  return moment !== null && moment !== undefined && moment.getTime() >= outcomeSince(at).getTime();
}

/**
 * Что стало с уведомлением о действии: ушло письмом, ушло в Telegram, не
 * уйдёт — почта не настроена, не уйдёт — бот Telegram не настроен, или
 * уведомления нет вовсе (человеку оно не положено, у него нет входа или
 * каналы выключены).
 */
export type NoticeFate = 'email' | 'telegram' | 'mail-off' | 'telegram-off' | 'none';

/**
 * Судьба уведомления по каналам строк очереди: канал без настройки — почта
 * без SMTP, Telegram без бота — не в счёт. Строка очереди без настроенного
 * канала называет настоящую причину: у человека уведомления включены, не
 * настроен канал практики.
 */
export function fateOf(
  channels: readonly string[],
  ready: { readonly mail: boolean; readonly telegram: boolean },
): NoticeFate {
  if (channels.includes('EMAIL') && ready.mail) return 'email';
  if (channels.includes('TELEGRAM') && ready.telegram) return 'telegram';
  if (channels.includes('EMAIL')) return 'mail-off';
  if (channels.includes('TELEGRAM')) return 'telegram-off';
  return 'none';
}

/** Клиенту после «Согласовать этап»: день и следующее дело (ссылкой на экране). */
export function approvedLine(day: string): string {
  return `Этап согласован ${day}.`;
}

/** Следующее дело клиента по работе — подпись ссылки; дел нет — «к работе». */
export function clientNextLabel(next: { readonly state: string; readonly title: string } | null): string {
  if (next === null) return 'к работе';
  return next.state === 'AWAITING_CLIENT' ? `материалы к этапу «${next.title}»` : `согласование этапа «${next.title}»`;
}

/**
 * Практике после перевода на согласование. Без срока согласования (у
 * клиента нет входа, Р-291) — без даты: срок не идёт.
 */
export function approvalSentLine(dueDay: string | null): string {
  return dueDay === null
    ? 'Этап переведён на согласование у клиента.'
    : `Этап отправлен клиенту на согласование до ${dueDay}.`;
}

/** Практике после «Опубликовать клиенту». */
export const PUBLISHED_LINE = 'Версия опубликована: клиент её видит.';

/** Практике после переноса срока этапа: уведомит ли клиента кабинет. */
export function dueMovedLine(day: string, fate: NoticeFate): string {
  const head = `Срок этапа перенесён на ${day}`;
  if (fate === 'email' || fate === 'telegram') return `${head}; клиент получит уведомление.`;
  if (fate === 'mail-off') return `${head}; уведомление клиенту не уйдёт — почта не настроена, сообщите ему сами.`;
  if (fate === 'telegram-off') return `${head}; уведомление клиенту не уйдёт — бот Telegram не настроен, сообщите ему сами.`;
  return `${head}; уведомления клиенту нет — сообщите ему сами.`;
}

/**
 * После одобрения заявки и «Нового заказа»: кто менеджер (`null` — тот, кто
 * завёл работу, сам), ушло ли ему уведомление, где файлы. «Дальше» с
 * кнопками карточки экран дописывает ссылками.
 */
export function workCreatedLine(input: {
  readonly manager: string | null;
  readonly fate: NoticeFate;
  readonly files: 'lead' | 'order' | null;
}): string {
  const parts = ['Работа заведена', input.manager === null ? 'менеджер — вы' : `менеджер — ${input.manager}`];
  if (input.manager !== null) {
    parts.push(
      input.fate === 'email'
        ? 'письмо ему ушло'
        : input.fate === 'telegram'
          ? 'сообщение в Telegram ему ушло'
          : input.fate === 'mail-off'
            ? 'письмо ему не уйдёт — почта не настроена, сообщите сами'
            : input.fate === 'telegram-off'
              ? 'сообщение в Telegram ему не уйдёт — бот не настроен, сообщите сами'
              : 'уведомления у него выключены — сообщите сами',
    );
  }
  if (input.files === 'lead') parts.push('вложения заявки — в «Материалах работы»');
  if (input.files === 'order') parts.push('документ заказа — в «Материалах работы»');
  return `${parts.join('; ')}.`;
}
