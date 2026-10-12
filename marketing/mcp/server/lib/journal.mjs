/**
 * Журнал сервера: чтения, предложения, попытки подтверждения, применения
 * (спецификация, раздел 1, принцип 5).
 *
 * Строка — событие JSON. Файл только дописывается; состояние предложений
 * восстанавливается из журнала, поэтому перезапуск сервера ничего не
 * теряет. Токены и коды подтверждения в журнал не пишутся — только соль
 * и отпечаток кода.
 */

import fs from 'node:fs';
import path from 'node:path';

export function createJournal(file, { now = () => new Date() } = {}) {
  function append(event) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const record = { at: now().toISOString(), ...event };
    fs.appendFileSync(file, JSON.stringify(record) + '\n', 'utf8');
    return record;
  }

  function read() {
    if (!fs.existsSync(file)) return [];
    return fs
      .readFileSync(file, 'utf8')
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => JSON.parse(line));
  }

  return { append, read, file };
}
