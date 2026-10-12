#!/usr/bin/env node
/**
 * Перенос реестра рекламы в кабинет руководителя (решение Р-550).
 *
 * Запуск из корня репозитория:
 *   node tools/ads-registry.mjs
 *
 * Проверка и перенос живут в `app/scripts/ads-registry.mjs`: их импортирует
 * `tests/ads.test.ts`, а образ приложения собирается из одного `app`.
 */

import { OUTPUT, writeRegistry } from '../app/scripts/ads-registry.mjs';

const registry = writeRegistry();
console.log(
  `Реестр рекламы: кампаний ${registry.campaigns.length}, предложений ${registry.proposals.length}, ` +
    `работ ${registry.works.length}, сервисов ${registry.services.length}, документов ${registry.docs.length} -> ${OUTPUT}`,
);
