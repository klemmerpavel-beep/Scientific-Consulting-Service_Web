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

/** Промежуточный экран служебных разделов — пункт «Управление». */
export const TOOLS_HREF = '/cabinet/manage/tools';

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
  // «Настройки», а не «Уведомления»: на экране и способы связи, и каналы,
  // и согласие (требование Т-08, решение Р-314). Состав меню не меняется.
  const settings: NavItem = { href: '/cabinet/settings', label: 'Настройки' };
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
  // Менеджеру — то, с чем он работает каждый день: дела на сегодня, свои
  // работы, заявки и реестры. Промежуточного «Управления» у него нет: из
  // служебного контура ему открыты только заявки и реестры, и они стоят в
  // меню сами (требование М-05, решение Р-305).
  if (actor.role === 'MANAGER') {
    return [
      { href: '/cabinet/manage', label: 'Сегодня' },
      { href: '/cabinet/projects', label: 'Мои работы' },
      { href: '/cabinet/manage/leads', label: 'Заявки' },
      { href: '/cabinet/manage/registry', label: 'Реестры' },
      settings,
    ];
  }
  // Главный экран руководителя — сводка практики с деньгами (решения Р-149,
  // Р-172).
  const staff: NavItem[] = [
    { href: '/cabinet/manage', label: 'Сводка' },
    { href: '/cabinet/projects', label: 'Работы' },
  ];
  staff.push({ href: '/cabinet/manage/finance', label: 'Деньги' });
  staff.push({ href: '/cabinet/manage/analytics', label: 'Аналитика' });
  // Служебный контур — реестры, учётные записи, справочники, перенос книги,
  // журналы, очередь уведомлений, удаление данных — собран за одним пунктом
  // (решение Р-158). В первый ряд эти разделы не выносятся по Р-140: они
  // нужны изредка. Но и доступными только по набранному вручную адресу они
  // быть не должны — о них тогда знает лишь тот, кто писал код.
  staff.push({ href: TOOLS_HREF, label: 'Управление' });
  return [...staff, settings];
}

/**
 * Начальный экран роли: куда ведёт вход, адрес `/cabinet` при открытой
 * сессии и экран, на который у человека нет права.
 *
 * Прежде все три вели на перечень работ, хотя первым экраном служебных
 * ролей решение Р-172 называет сводку: менеджер после входа видел перечень,
 * а дела на сегодня искал в меню (требование М-05, решение Р-305).
 */
export function homeFor(actor: Actor): string {
  return actor.role === 'MANAGER' || actor.role === 'HEAD' ? '/cabinet/manage' : '/cabinet/projects';
}

/** Есть ли в меню роли промежуточный экран служебных разделов. */
export function hasToolsScreen(actor: Actor): boolean {
  return navFor(actor).some((item) => item.href === TOOLS_HREF);
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
  const tools = TOOLS_HREF;
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


/**
 * Карточка, на которую «Мои работы» ведут сразу (требование Т-09, решение
 * Р-311): клиент, ровно одна работа, она действует или приостановлена
 * (О-11), блок первого входа закрыт (О-3), отбора в адресе нет. Иначе —
 * перечень (`null`).
 */
export function soleWorkTarget(input: {
  readonly role: Actor['role'];
  readonly welcomeOpen: boolean;
  readonly asked: boolean;
  readonly all: number;
  readonly rows: readonly { readonly code: string; readonly status: string }[];
}): string | null {
  if (input.role !== 'CLIENT' || input.welcomeOpen || input.asked) return null;
  if (input.all !== 1 || input.rows.length !== 1) return null;
  const only = input.rows[0]!;
  return only.status === 'ACTIVE' || only.status === 'PAUSED' ? `/cabinet/projects/${only.code}` : null;
}
