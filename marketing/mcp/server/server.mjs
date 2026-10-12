#!/usr/bin/env node
/**
 * MCP-сервер Директа и Метрики для ProDisser — каркас по
 * `../01-спецификация.md`.
 *
 * Запуск (stdio):
 *   MCP_CONFIG=marketing/mcp/server/config.json \
 *   DIRECT_TOKEN=… METRIKA_TOKEN=… \
 *   MCP_TELEGRAM_BOT_TOKEN=… MCP_TELEGRAM_CHAT_ID=… \
 *   node marketing/mcp/server/server.mjs
 *
 * В stdout — только сообщения протокола; диагностика — в stderr.
 */

import path from 'node:path';

import { loadConfig } from './lib/config.mjs';
import { createDirect } from './lib/direct.mjs';
import { createJournal } from './lib/journal.mjs';
import { createMetrika } from './lib/metrika.mjs';
import { createTelegram } from './lib/notify.mjs';
import { createProposals } from './lib/proposals.mjs';
import { createHandler, serveStdio } from './lib/protocol.mjs';
import { createTools } from './lib/tools.mjs';

const INSTRUCTIONS = [
  'Сервер рекламы ProDisser. Чтение отчётов свободно.',
  'Любое изменение — только предложением (propose_*): сервер сверяет его с потолками владельца и отправляет владельцу код в Telegram.',
  'apply_confirmed вызывается только с кодом, который владелец сам передал в разговоре. Код не угадывают и не запрашивают у сервера.',
  'Удаления, пополнения и данные маркировки в набор не входят.',
].join(' ');

function memo(factory) {
  let value;
  return () => (value ??= factory());
}

const configFile = process.env.MCP_CONFIG ?? path.join(import.meta.dirname, 'config.json');
const config = loadConfig(configFile);
const journal = createJournal(config.journal);
const telegram = createTelegram({ botToken: process.env.MCP_TELEGRAM_BOT_TOKEN, chatId: process.env.MCP_TELEGRAM_CHAT_ID });

const direct = memo(() =>
  createDirect({
    token: process.env.DIRECT_TOKEN,
    clientLogin: config.clientLogin,
    sandbox: config.sandbox,
    version: config.apiVersion,
  }),
);
const metrika = memo(() => createMetrika({ token: process.env.METRIKA_TOKEN, counterId: config.metrika.counterId }));
const proposals = createProposals({ journal, config, telegram });

const handle = createHandler({
  name: 'prodisser-direct',
  version: '0.1.0',
  instructions: INSTRUCTIONS,
  tools: createTools({ config, direct, metrika, journal, proposals }),
});

process.stderr.write(
  `prodisser-direct: ${config.sandbox ? 'песочница' : 'рабочий Директ'}, запись ${config.write ? 'включена' : 'выключена'}, ` +
    `канал владельца ${telegram ? 'есть' : 'не настроен'}, журнал ${config.journal}\n`,
);
serveStdio(handle);
