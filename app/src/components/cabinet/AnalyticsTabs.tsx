/**
 * Переключатель вкладок аналитики. Обычные ссылки, а не состояние на
 * стороне браузера: вкладка должна открываться по адресу, показываться
 * в истории и жить без выполнения сценариев.
 *
 * Сама полоса вкладок живёт в общих частях: та же разметка понадобилась
 * журналам, и второго написания не заводится. Здесь остаётся только
 * перечень разделов аналитики — его читает и сводный заголовок витрин.
 */

import { Tabs } from './ui';

export const ANALYTICS_TABS = [
  { href: '/cabinet/manage/analytics', label: 'Обзор' },
  { href: '/cabinet/manage/analytics/money', label: 'Деньги' },
  { href: '/cabinet/manage/analytics/clients', label: 'Клиенты' },
  { href: '/cabinet/manage/analytics/products', label: 'Продукты' },
  { href: '/cabinet/manage/analytics/projects', label: 'Сроки' },
  { href: '/cabinet/manage/analytics/losses', label: 'Потери' },
] as const;

export default function AnalyticsTabs({ current }: { current: string }) {
  return (
    <Tabs
      label="Разделы аналитики"
      items={ANALYTICS_TABS.map((tab) => ({ ...tab, active: tab.href === current }))}
    />
  );
}
