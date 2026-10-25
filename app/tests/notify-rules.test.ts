/**
 * Настройки уведомлений: таблица каналов на телефоне и без молчаливой
 * потери писем (решение Р-736).
 *
 * Пока чат Telegram не привязан, флажки столбца Telegram неактивны и
 * связаны с пояснением; сохранение не трогает правила Telegram (на базе —
 * `notify-rules.db.test.ts`); события, о которых не сообщат ни одним
 * каналом, экран называет; на узком экране подписи «письмом» и «в Telegram»
 * в ячейках убраны с глаз, а читалка у каждого флажка называет событие и
 * канал. Р-198 — правило действует только среди разрешённых каналов — не
 * меняется: меняется показ.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { savableRules, savedChannels, silentEvents } from '../src/lib/cabinet/notify-rules.ts';

const SRC = path.join(import.meta.dirname, '..', 'src');
const page = readFileSync(path.join(SRC, 'app', 'cabinet', 'settings', 'page.tsx'), 'utf8');
const channelsSource = readFileSync(path.join(SRC, 'lib', 'cabinet', 'channels.ts'), 'utf8');
const tokens = readFileSync(path.join(SRC, 'components', 'cabinet', 'tokens.ts'), 'utf8');

describe('правила без привязанного Telegram (Р-736)', () => {
  const rules = [
    { eventKind: 'CURATOR_TURN', channel: 'EMAIL', enabled: false },
    { eventKind: 'CURATOR_TURN', channel: 'TELEGRAM', enabled: false },
    { eventKind: 'DEADLINE_MISSED', channel: 'EMAIL', enabled: true },
    { eventKind: 'DEADLINE_MISSED', channel: 'TELEGRAM', enabled: false },
  ] as const;

  it('без чата перезаписывается только почта', () => {
    assert.deepEqual(savedChannels(false), ['EMAIL']);
    assert.deepEqual(
      savableRules(rules, false).map((rule) => `${rule.eventKind}:${rule.channel}`),
      ['CURATOR_TURN:EMAIL', 'DEADLINE_MISSED:EMAIL'],
    );
  });

  it('с привязанным чатом — оба канала, как прежде', () => {
    assert.deepEqual(savedChannels(true), ['EMAIL', 'TELEGRAM']);
    assert.equal(savableRules(rules, true).length, 4);
  });

  it('`saveRules` проверяет привязку по базе и стирает только перезаписываемые каналы', () => {
    const body = channelsSource.slice(channelsSource.indexOf('export async function saveRules('));
    assert.match(body, /select: \{ telegramChatId: true \}/u);
    assert.match(body, /savableRules\(/u);
    assert.match(body, /deleteMany\(\{\s*where: \{ userId: actor\.id, channel: \{ in: \[\.\.\.savedChannels\(bound\)\] \} \},/u);
    assert.doesNotMatch(body.slice(0, body.indexOf('await record(')), /deleteMany\(\{ where: \{ userId: actor\.id \} \}\)/u);
  });
});

describe('события без канала (Р-736)', () => {
  const events = [{ kind: 'CURATOR_TURN' }, { kind: 'DEADLINE_MISSED' }, { kind: 'PAYOUT_PAID' }];
  const off = new Set(['CURATOR_TURN:EMAIL', 'DEADLINE_MISSED:EMAIL', 'DEADLINE_MISSED:TELEGRAM']);
  const ruleOn = (kind: string, channel: string) => !off.has(`${kind}:${channel}`);

  it('без Telegram событие со снятой почтой молчит', () => {
    assert.deepEqual(
      silentEvents(events, ruleOn, { email: true, telegram: false }).map((event) => event.kind),
      ['CURATOR_TURN', 'DEADLINE_MISSED'],
    );
  });

  it('с Telegram молчит только снятое в обоих столбцах', () => {
    assert.deepEqual(
      silentEvents(events, ruleOn, { email: true, telegram: true }).map((event) => event.kind),
      ['DEADLINE_MISSED'],
    );
  });

  it('выключенная почта без Telegram — молчат все', () => {
    assert.equal(silentEvents(events, ruleOn, { email: false, telegram: false }).length, 3);
  });

  it('экран считает Telegram только при привязанном чате и называет молчащие события', () => {
    assert.match(page, /silentEvents\(ruleEvents, ruleOn, \{\s*email: user\.notifyEmail,\s*telegram: user\.notifyTelegram && bound,\s*\}\)/u);
    assert.match(page, /`Не сообщим ни письмом, ни в Telegram: \$\{silent\.map\(\(event\) => `«\$\{event\.title\}»`\)\.join\(', '\)\}\.`/u);
    // После сохранения — в итоге сохранения и у самой таблицы.
    assert.match(page, /<Outcome>\{silentLine === null \? 'Настройки сохранены\.' : `Настройки сохранены\. \$\{silentLine\}`\}<\/Outcome>/u);
    assert.match(page, /<Notice tone="quiet">\{silentLine\}<\/Notice>/u);
  });
});

describe('флажки таблицы правил (Р-736)', () => {
  const start = page.indexOf('<Form action={saveNotifyRules}>');
  const form = page.slice(start, page.indexOf('</Form>', start));

  it('флажки Telegram неактивны без привязанного чата и связаны с пояснением', () => {
    assert.match(form, /disabled=\{channel === 'TELEGRAM' && !bound\}/u);
    assert.match(form, /describedBy=\{channel === 'TELEGRAM' && !bound \? 'rules-telegram-hint' : undefined\}/u);
    assert.match(page, /<Text id="rules-telegram-hint"[^>]*>\s*\{mayBind\s*\? 'Сначала подключите Telegram в карточке «Telegram»\.'\s*: 'Telegram не настроен на стороне сервиса\.'\}/u);
  });

  it('читалка у каждого флажка называет событие и канал', () => {
    assert.match(form, /<span style=\{VISUALLY_HIDDEN\}>\{`\$\{event\.title\} — `\}<\/span>/u);
    assert.match(form, /<span className="cab-rule-seen">\{channel === 'EMAIL' \? 'письмом' : 'в Telegram'\}<\/span>/u);
  });

  it('на узком экране подписи в ячейках убраны с глаз, поля ячеек уже', () => {
    assert.match(form, /<table className="cab-rules"/u);
    const rule = tokens.match(/@media \(max-width:600px\)\{([^\n]*)\}/u);
    assert.ok(rule !== null, 'нет правила для узкого экрана');
    assert.match(rule[1]!, /\.cab-rule-seen\{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset\(50%\)/u);
    assert.match(rule[1]!, /\.cab-rules th,\.cab-rules td\{padding-left:8px!important;padding-right:8px!important\}/u);
  });
});
