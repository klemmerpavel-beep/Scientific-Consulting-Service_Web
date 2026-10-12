/**
 * Reporting API Метрики: достижения цели `lead` по меткам и страницам входа.
 *
 * Токен — только с правом `metrika:read` (`../../research/04-площадки-и-правила.md`,
 * раздел 6.2). Метрика видит лишь посетителей, согласившихся на статистику,
 * поэтому её числа ниже заявок в кабинете (`../../strategy/00-аудит-и-критический-путь.md`).
 */

const BASE = 'https://api-metrika.yandex.net/stat/v1/data';

export function createMetrika({ token, counterId, fetchImpl = globalThis.fetch }) {
  async function goalConversions({ goalId, dateFrom, dateTo }) {
    if (!token) throw new Error('Нет токена Метрики: переменная METRIKA_TOKEN');
    if (!counterId) throw new Error('Не задан номер счётчика: metrika.counterId в конфигурации');
    if (!goalId) throw new Error('Не задана цель: metrika.goalId в конфигурации');
    const query = new URLSearchParams({
      ids: String(counterId),
      metrics: `ym:s:visits,ym:s:goal${goalId}reaches`,
      dimensions: 'ym:s:lastsignUTMSource,ym:s:lastsignUTMCampaign,ym:s:startURLPath',
      date1: dateFrom,
      date2: dateTo,
      accuracy: 'full',
      limit: '1000',
    });
    const response = await fetchImpl(`${BASE}?${query}`, { headers: { Authorization: `OAuth ${token}` } });
    if (!response.ok) {
      let message = `Метрика ${response.status}`;
      try {
        const body = await response.json();
        if (body?.message) message += `: ${body.message}`;
      } catch {
        // тело ошибки не JSON — достаточно кода
      }
      throw new Error(message);
    }
    const body = await response.json();
    return (body.data ?? []).map((row) => ({
      utmSource: row.dimensions?.[0]?.name ?? null,
      utmCampaign: row.dimensions?.[1]?.name ?? null,
      landing: row.dimensions?.[2]?.name ?? null,
      visits: row.metrics?.[0] ?? 0,
      leads: row.metrics?.[1] ?? 0,
    }));
  }

  return { goalConversions };
}
