/**
 * Клиент API Директа: сервисы JSON v5 и отчёты.
 *
 * Адреса и порядок отчётов — `../../research/04-площадки-и-правила.md`,
 * раздел 6.1. Деньги в сервисах — в микроединицах (рубль × 1 000 000);
 * отчёты запрашиваются в рублях без НДС.
 */

import crypto from 'node:crypto';

export const MICRO = 1_000_000;

const HOSTS = {
  live: 'https://api.direct.yandex.com/json/',
  sandbox: 'https://api-sandbox.direct.yandex.com/json/',
};

export class DirectError extends Error {
  constructor(code, message, detail) {
    super(`Директ ${code}: ${message}${detail ? ` (${detail})` : ''}`);
    this.code = code;
  }
}

/** Разбор отчёта TSV: первая строка — заголовки, «--» — пустое значение. */
export function parseTsv(text) {
  const lines = text.split('\n').filter((line) => line.trim() !== '');
  if (lines.length === 0) return [];
  const header = lines[0].split('\t');
  return lines.slice(1).map((line) => {
    const cells = line.split('\t');
    return Object.fromEntries(header.map((name, i) => {
      const value = cells[i];
      if (value === undefined || value === '--') return [name, null];
      return [name, /^-?\d+(\.\d+)?$/.test(value) ? Number(value) : value];
    }));
  });
}

/**
 * Имя отчёта — отпечаток его определения: Директ кеширует офлайн-отчёт по
 * имени и отказывает, если то же имя пришло с другими параметрами.
 */
export function reportName(definition) {
  const { ReportName, ...rest } = definition;
  return 'pd-' + crypto.createHash('sha1').update(JSON.stringify(rest)).digest('hex').slice(0, 16);
}

export function createDirect({
  token,
  clientLogin = null,
  sandbox = true,
  version = 'v5',
  fetchImpl = globalThis.fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  maxWaitMs = 180_000,
}) {
  if (!token) throw new Error('Нет токена Директа: переменная DIRECT_TOKEN');
  const base = (sandbox ? HOSTS.sandbox : HOSTS.live) + version + '/';
  let lastUnits = null;

  function headers(extra = {}) {
    const result = {
      Authorization: `Bearer ${token}`,
      'Accept-Language': 'ru',
      'Content-Type': 'application/json; charset=utf-8',
      ...extra,
    };
    if (clientLogin) result['Client-Login'] = clientLogin;
    return result;
  }

  async function errorOf(response) {
    let body = null;
    try {
      body = await response.json();
    } catch {
      return new DirectError(response.status, 'ответ не JSON');
    }
    const error = body?.error ?? {};
    return new DirectError(error.error_code ?? response.status, error.error_string ?? 'ошибка', error.error_detail);
  }

  async function call(service, method, params) {
    const response = await fetchImpl(base + service, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ method, params }),
    });
    lastUnits = response.headers.get('Units');
    if (!response.ok) throw await errorOf(response);
    const body = await response.json();
    if (body.error) throw new DirectError(body.error.error_code, body.error.error_string, body.error.error_detail);
    return body.result;
  }

  /**
   * Отчёт: 200 — готов, 201 и 202 — поставлен в очередь, ждать `retryIn`
   * секунд и спросить снова тем же определением.
   */
  async function report(definition) {
    const params = { ...definition, ReportName: reportName(definition), Format: 'TSV', IncludeVAT: 'NO' };
    const started = Date.now();
    for (;;) {
      const response = await fetchImpl(base + 'reports', {
        method: 'POST',
        headers: headers({
          processingMode: 'auto',
          returnMoneyInMicros: 'false',
          skipReportHeader: 'true',
          skipReportSummary: 'true',
        }),
        body: JSON.stringify({ params }),
      });
      lastUnits = response.headers.get('Units');
      if (response.status === 200) return parseTsv(await response.text());
      if (response.status === 201 || response.status === 202) {
        const retry = Number(response.headers.get('retryIn') ?? 5);
        if (Date.now() - started + retry * 1000 > maxWaitMs) {
          throw new Error('Отчёт Директа не готов за отведённое время, повторите запрос позже');
        }
        await sleep(retry * 1000);
        continue;
      }
      throw await errorOf(response);
    }
  }

  return { call, report, units: () => lastUnits };
}
