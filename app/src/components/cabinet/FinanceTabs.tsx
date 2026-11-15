/**
 * Вкладки раздела «Деньги» (аудит 15.11.2026, находка Н-5; решение Р-924).
 *
 * Пять подразделов — «Должники», «Поступления», «Вознаграждение
 * кураторов», «Прибыль по месяцам», «Итоги по годам» — стояли ссылками в
 * абзаце под заголовком «Денег»: найти «Должников» значило прочитать
 * абзац. Теперь это полоса вкладок, та же, что у «Аналитики», и она стоит
 * на каждом экране раздела. Вкладка видна, только когда экран открыт
 * праву смотрящего.
 */

import { can, type Action, type Actor } from '../../lib/cabinet/access';
import { Tabs } from './ui';

export const FINANCE_TABS: readonly { href: string; label: string; action: Action }[] = [
  { href: '/cabinet/manage/finance', label: 'По работам', action: 'MARGIN_VIEW' },
  { href: '/cabinet/manage/finance/debtors', label: 'Должники', action: 'MARGIN_VIEW' },
  { href: '/cabinet/manage/finance/receipts', label: 'Поступления', action: 'MARGIN_VIEW' },
  { href: '/cabinet/manage/finance/payouts', label: 'Вознаграждение кураторов', action: 'PAYOUT_MANAGE' },
  { href: '/cabinet/manage/finance/profit', label: 'Прибыль по месяцам', action: 'MARGIN_VIEW' },
  { href: '/cabinet/manage/finance/years', label: 'Итоги по годам', action: 'MARGIN_VIEW' },
];

export default function FinanceTabs({ actor, current }: { actor: Actor; current: string }) {
  return (
    <Tabs
      label="Разделы денег"
      items={FINANCE_TABS.filter((tab) => can(actor, tab.action)).map((tab) => ({
        href: tab.href,
        label: tab.label,
        active: tab.href === current,
      }))}
    />
  );
}
