/**
 * Разделы кабинета по ролям и подсветка текущего.
 *
 * Модуль вынесен из каркаса: каркас — клиентская разметка с расширением
 * `.tsx`, а проверки идут встроенным `node --test`, который такого
 * расширения не понимает. Здесь только данные и правило выбора, разметки
 * нет (решение Р-183).
 */

import type { Actor } from './access.ts';

export interface NavItem {
  readonly href: string;
  readonly label: string;
}

/**
 * Разделы роли.
 *
 * Первый ряд навигации занят работой: у клиента — его работы, у штатных
 * ролей — то, что требует вмешательства, работы, деньги и аналитика.
 * Служебный контур в этот ряд не выносится (решение Р-140) и собран за
 * одним пунктом «Управление» (решение Р-158): перенос книги заказов,
 * журналы, очередь уведомлений, учётные записи, справочники, реестры,
 * удаление данных субъекта.
 */
export function navFor(actor: Actor): NavItem[] {
  const settings: NavItem = { href: '/cabinet/settings', label: 'Уведомления' };
  if (actor.role === 'CLIENT') {
    return [
      { href: '/cabinet/projects', label: 'Мои работы' },
      { href: '/cabinet/request', label: 'Новая заявка' },
      settings,
    ];
  }
  if (actor.role === 'EXPERT') {
    return [
      { href: '/cabinet/projects', label: 'Назначенные работы' },
      { href: '/cabinet/payout', label: 'Вознаграждение' },
      settings,
    ];
  }
  // Главный экран у ролей разный по существу: руководителю — сводка
  // практики с деньгами, менеджеру — то, что требует вмешательства по его
  // работам (решение Р-149). Маршрут один, название честное для каждой.
  const staff: NavItem[] = [
    { href: '/cabinet/manage', label: actor.role === 'HEAD' ? 'Сводка' : 'Требует внимания' },
    { href: '/cabinet/projects', label: 'Работы' },
  ];
  if (actor.role === 'HEAD') {
    staff.push({ href: '/cabinet/manage/finance', label: 'Деньги' });
    staff.push({ href: '/cabinet/manage/analytics', label: 'Аналитика' });
  }
  // Служебный контур — реестры, учётные записи, справочники, перенос книги,
  // журналы, очередь уведомлений, удаление данных — собран за одним пунктом
  // (решение Р-158). В первый ряд эти разделы не выносятся по Р-140: они
  // нужны изредка. Но и доступными только по набранному вручную адресу они
  // быть не должны — о них тогда знает лишь тот, кто писал код.
  staff.push({ href: '/cabinet/manage/tools', label: 'Управление' });
  return [...staff, settings];
}

/**
 * Какой пункт меню подсвечен.
 *
 * Сверка строгим равенством оставляла без подсветки шесть служебных
 * экранов: их адресов в меню нет, и ни один пункт не получал пометки
 * текущего. Теперь подходит пункт, с которого начинается адрес экрана, а
 * из подошедших берётся самый длинный — иначе «Сводка» (`/cabinet/manage`)
 * перебивала бы «Деньги» (`/cabinet/manage/finance`). Служебные экраны
 * подсвечивают «Управление» по тому же правилу — через `/cabinet/manage/`
 * (решение Р-183).
 */
export function activeItem(items: readonly NavItem[], current: string): string | null {
  const tools = '/cabinet/manage/tools';
  let best: string | null = null;
  for (const item of items) {
    const hit =
      current === item.href ||
      current.startsWith(`${item.href}/`) ||
      // Служебный контур собран за одним пунктом: все его экраны лежат
      // внутри `/cabinet/manage/`, но пунктами меню не являются.
      (item.href === tools &&
        current.startsWith('/cabinet/manage/') &&
        !current.startsWith('/cabinet/manage/finance') &&
        !current.startsWith('/cabinet/manage/analytics'));
    if (hit && (best === null || item.href.length > best.length)) best = item.href;
  }
  return best;
}

