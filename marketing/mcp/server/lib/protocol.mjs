/**
 * Протокол MCP поверх stdio: JSON-RPC 2.0, одно сообщение на строку.
 *
 * Библиотека MCP не подключается (CONTRIBUTING.md, правило 5): серверу
 * нужны четыре метода — initialize, ping, tools/list, tools/call, — и их
 * проще держать в одном файле, чем вносить пакет с его зависимостями.
 */

export const SUPPORTED_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];

const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const INTERNAL_ERROR = -32603;

function failure(id, code, message) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}

function success(id, result) {
  return { jsonrpc: '2.0', id, result };
}

/** Текстовый ответ инструмента; данные — JSON, чтобы агент читал поля, а не прозу. */
export function textResult(data, isError = false) {
  const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  return isError ? { content: [{ type: 'text', text }], isError: true } : { content: [{ type: 'text', text }] };
}

/**
 * Обработчик сообщений. `tools` — список { name, description, inputSchema, run }.
 * Возвращает ответ или null для уведомлений, на которые не отвечают.
 */
export function createHandler({ name, version, instructions, tools }) {
  const byName = new Map(tools.map((tool) => [tool.name, tool]));

  return async function handle(message) {
    if (!message || typeof message !== 'object' || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
      return failure(message?.id, INVALID_REQUEST, 'Неверный запрос JSON-RPC');
    }
    const { id, method, params } = message;
    const isNotification = id === undefined;

    if (method.startsWith('notifications/')) return null;

    let response;
    switch (method) {
      case 'initialize': {
        const asked = params?.protocolVersion;
        const protocolVersion = SUPPORTED_VERSIONS.includes(asked) ? asked : SUPPORTED_VERSIONS[0];
        response = success(id, {
          protocolVersion,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name, version },
          instructions,
        });
        break;
      }
      case 'ping':
        response = success(id, {});
        break;
      case 'tools/list':
        response = success(id, {
          tools: tools.map(({ name: toolName, description, inputSchema }) => ({ name: toolName, description, inputSchema })),
        });
        break;
      case 'tools/call': {
        const tool = byName.get(params?.name);
        if (!tool) {
          response = failure(id, INVALID_PARAMS, `Нет инструмента ${params?.name}`);
          break;
        }
        try {
          response = success(id, await tool.run(params.arguments ?? {}));
        } catch (error) {
          // Ошибка инструмента — ответ агенту, а не сбой протокола: он должен
          // её прочитать и решить, что делать дальше.
          response = success(id, textResult(`Ошибка: ${error.message}`, true));
        }
        break;
      }
      default:
        response = failure(id, METHOD_NOT_FOUND, `Метод ${method} не поддерживается`);
    }
    return isNotification ? null : response;
  };
}

/** Цикл чтения stdin: строка — сообщение, ответ — строка в stdout. */
export function serveStdio(handle, { input = process.stdin, output = process.stdout } = {}) {
  let buffer = '';
  let queue = Promise.resolve();
  input.setEncoding('utf8');
  input.on('data', (chunk) => {
    buffer += chunk;
    let newline;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      // Ответы уходят в порядке запросов: проще для отладки, а
      // параллельность серверу на одного агента не нужна.
      queue = queue.then(async () => {
        let message;
        try {
          message = JSON.parse(line);
        } catch {
          output.write(JSON.stringify(failure(null, PARSE_ERROR, 'Строка не JSON')) + '\n');
          return;
        }
        try {
          const response = await handle(message);
          if (response) output.write(JSON.stringify(response) + '\n');
        } catch (error) {
          output.write(JSON.stringify(failure(message.id, INTERNAL_ERROR, error.message)) + '\n');
        }
      });
    }
  });
  return () => queue;
}
