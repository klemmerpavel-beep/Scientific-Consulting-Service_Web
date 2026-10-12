import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { test } from 'node:test';

import { createHandler, serveStdio, SUPPORTED_VERSIONS, textResult } from '../lib/protocol.mjs';
import { EXAMPLE, tempDir } from './helpers.mjs';

const tools = [
  { name: 'ok', description: 'ответ', inputSchema: { type: 'object' }, run: async (args) => textResult({ echo: args.x ?? null }) },
  { name: 'boom', description: 'отказ', inputSchema: { type: 'object' }, run: async () => { throw new Error('нет доступа'); } },
];
const handle = createHandler({ name: 't', version: '0.0.1', instructions: 'и', tools });

test('initialize: версия клиента, если поддерживается, иначе своя последняя', async () => {
  const known = await handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } });
  assert.equal(known.result.protocolVersion, '2025-03-26');
  assert.deepEqual(known.result.capabilities, { tools: { listChanged: false } });
  const unknown = await handle({ jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '1999-01-01' } });
  assert.equal(unknown.result.protocolVersion, SUPPORTED_VERSIONS[0]);
});

test('tools/list отдаёт описания без функций', async () => {
  const response = await handle({ jsonrpc: '2.0', id: 3, method: 'tools/list' });
  assert.deepEqual(response.result.tools.map((t) => t.name), ['ok', 'boom']);
  assert.equal(response.result.tools[0].run, undefined);
});

test('tools/call: результат, ошибка инструмента — isError, неизвестный — ошибка протокола', async () => {
  const ok = await handle({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'ok', arguments: { x: 5 } } });
  assert.deepEqual(JSON.parse(ok.result.content[0].text), { echo: 5 });
  const boom = await handle({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'boom' } });
  assert.equal(boom.result.isError, true);
  assert.match(boom.result.content[0].text, /нет доступа/);
  const missing = await handle({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'nope' } });
  assert.equal(missing.error.code, -32602);
});

test('уведомления без ответа, неизвестный метод и неверный запрос — ошибки', async () => {
  assert.equal(await handle({ jsonrpc: '2.0', method: 'notifications/initialized' }), null);
  assert.equal((await handle({ jsonrpc: '2.0', id: 7, method: 'resources/list' })).error.code, -32601);
  assert.equal((await handle({ id: 8, method: 'ping' })).error.code, -32600);
});

test('stdio: строка — сообщение, ответы по порядку, мусор — ошибка разбора', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const lines = [];
  output.on('data', (chunk) => lines.push(...chunk.toString().split('\n').filter(Boolean)));
  const drained = serveStdio(handle, { input, output });
  input.write('{"jsonrpc":"2.0","id":1,"method":"ping"}\nне json\n');
  input.write('{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"ok","arguments":{"x":1}}}\n');
  await new Promise((resolve) => setImmediate(resolve));
  await drained();
  const parsed = lines.map((line) => JSON.parse(line));
  assert.deepEqual(parsed[0], { jsonrpc: '2.0', id: 1, result: {} });
  assert.equal(parsed[1].error.code, -32700);
  assert.equal(parsed[2].id, 2);
});

test('сервер запускается без токенов и отвечает по stdio', async () => {
  const dir = tempDir();
  const configFile = path.join(dir, 'config.json');
  fs.writeFileSync(configFile, JSON.stringify({ ...EXAMPLE, journal: path.join(dir, 'journal.jsonl') }));
  const server = path.join(import.meta.dirname, '..', 'server.mjs');
  const child = spawn(process.execPath, [server], {
    env: { PATH: process.env.PATH, MCP_CONFIG: configFile },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const replies = [];
  child.stdout.on('data', (chunk) => replies.push(...chunk.toString().split('\n').filter(Boolean)));
  child.stdin.write('{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18"}}\n');
  child.stdin.write('{"jsonrpc":"2.0","id":2,"method":"tools/list"}\n');
  child.stdin.write('{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"campaigns_list","arguments":{}}}\n');
  for (let i = 0; i < 100 && replies.length < 3; i++) await new Promise((resolve) => setTimeout(resolve, 20));
  child.kill();
  const [init, list, call] = replies.map((line) => JSON.parse(line));
  assert.equal(init.result.serverInfo.name, 'prodisser-direct');
  const names = list.result.tools.map((t) => t.name);
  assert.ok(names.includes('apply_confirmed') && names.includes('stats_report'));
  assert.ok(!names.some((n) => /delete|pay|deposit/.test(n)), 'удаления и платежей в наборе нет');
  assert.equal(call.result.isError, true);
  assert.match(call.result.content[0].text, /DIRECT_TOKEN/);
});
