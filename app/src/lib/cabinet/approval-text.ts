/**
 * Подписи срока согласования этапа (требования Т-15 и М-13, решения
 * Р-290, Р-291).
 *
 * Модуль чистый: ни базы, ни часов, ни переменных окружения — их значения
 * передаёт вызывающий. Дата у клиента и у практики берётся из одного поля
 * этапа (`approvalDueOn`) и пишется одной функцией, поэтому совпадает.
 */

/** День для письма и экрана: «28 сентября 2026». */
export function formatDay(day: Date): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
    .format(day)
    .replace(/\s*г\.$/u, '');
}

/** «1 рабочий день», «3 рабочих дня», «5 рабочих дней». */
export function workdaysPhrase(count: number): string {
  const tens = count % 100;
  const ones = count % 10;
  const word =
    tens >= 11 && tens <= 14
      ? 'рабочих дней'
      : ones === 1
        ? 'рабочий день'
        : ones >= 2 && ones <= 4
          ? 'рабочих дня'
          : 'рабочих дней';
  return `${count} ${word}`;
}

/**
 * Состояние срока для практики (требование М-13): идёт и до какого дня,
 * закроется ли этап сам, стоит ли на паузе, не идёт ли вовсе. `null` —
 * сказать нечего: срок ещё не поставлен расписанием.
 */
export function approvalStaffLine(input: {
  readonly dueOn: Date | null;
  readonly daysLeft: number | null;
  readonly clientHasLogin: boolean;
  readonly autoAccept: boolean;
}): string | null {
  if (input.daysLeft !== null) {
    return `Срок согласования остановлен: работа не в действии, осталось ${workdaysPhrase(input.daysLeft)}`;
  }
  if (input.dueOn !== null) {
    const day = formatDay(input.dueOn);
    return input.autoAccept
      ? `Срок согласования — до ${day} включительно; без ответа клиента этап закроется после ${day} (п. 7.3 оферты)`
      : `Срок согласования — до ${day} включительно; автозакрытие не включено`;
  }
  if (!input.clientHasLogin) {
    return 'Срок согласования не идёт: у клиента нет входа в кабинет — откройте его на карточке работы';
  }
  return null;
}
