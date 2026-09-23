/**
 * «Сегодня» для того, что кабинет показывает.
 *
 * Просрочка днями, окна «за квартал» и «ближайшие две недели», срок
 * «прошёл» — всё это читается от текущего дня. Наполнение базы снимков
 * отсчитывает даты от постоянной точки (`REFERENCE` в
 * `scripts/seed-artboards.ts`), а экраны считали от настоящего «сейчас»:
 * снимок, снятый во вторник, расходился со снятым в среду одними только
 * числами дней, и разбор изменений показывал шум вместо правок облика
 * (решение Р-205).
 *
 * Переменная `CABINET_NOW` задаёт день явно. Её выставляют только
 * инструменты съёмки и только при базе снимков; в бою она не действует,
 * и часы идут настоящие. Время входа, сессий, ссылок и очереди
 * уведомлений через этот модуль не ходит: там ошибка в часах стала бы
 * дырой, а не неточностью подписи.
 */

/**
 * Остановленные часы на боевой базе заморозили бы все просрочки, и
 * экраны тихо показывали бы неправду. Поэтому `CABINET_NOW` действует
 * только при базе снимков — той, в адресе которой есть слово «artboard»;
 * то же условие ставят наполнение и съёмка (решение Р-214).
 */
function fixedAllowed(): boolean {
  return /artboard/iu.test(process.env.DATABASE_URL ?? '');
}

export function now(): Date {
  const fixed = process.env.CABINET_NOW;
  if (fixed !== undefined && fixed !== '' && fixedAllowed()) {
    const at = Date.parse(fixed);
    if (!Number.isNaN(at)) return new Date(at);
  }
  return new Date();
}

/** Сколько полных суток прошло после срока; `null` — срок не наступил. */
export function daysPast(dueOn: Date | null | undefined, at: Date = now()): number | null {
  if (dueOn === null || dueOn === undefined) return null;
  const days = Math.floor((at.getTime() - dueOn.getTime()) / 86_400_000);
  return days > 0 ? days : null;
}
