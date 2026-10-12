/**
 * Предложения и подтверждения владельца (спецификация, раздел 1,
 * принцип 1).
 *
 * Предложение получает номер и одноразовый шестизначный код. Код уходит
 * владельцу в Telegram и агенту не возвращается; в журнал пишутся соль и
 * отпечаток. Владелец, согласный с предложением, передаёт код агенту, и
 * только с ним `apply_confirmed` выполняет изменение — один раз.
 *
 * Чего это не закрывает: агент с доступом к оболочке сервера мог бы
 * прочитать токены и вызвать API напрямую. Код защищает от применения по
 * ошибке или по выдуманному «согласию», а не от злонамеренного агента;
 * для этого сервер запускают от отдельного пользователя ОС (README).
 */

import crypto from 'node:crypto';

const MOSCOW = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Europe/Moscow',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

function digest(salt, id, code) {
  return crypto.createHash('sha256').update(`${salt}:${id}:${code}`).digest('hex');
}

function sameDigest(a, b) {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

/** Текст владельцу: что меняется, где, влияние на расход и код. */
export function ownerMessage(proposal, code) {
  const lines = [
    `ProDisser · предложение ${proposal.id}`,
    `Кампания: ${proposal.campaignName} (${proposal.directionTitle})`,
    `Что: ${proposal.summary}`,
    `Расход: ${proposal.effect}`,
  ];
  if (proposal.reason) lines.push(`Почему: ${proposal.reason}`);
  lines.push(
    `Код подтверждения: ${code}`,
    `Действует до ${MOSCOW.format(new Date(proposal.expires))} по Москве.`,
    'Передайте код агенту, только если согласны.',
  );
  return lines.join('\n');
}

export function createProposals({ journal, config, telegram, now = () => new Date(), randomCode }) {
  const nextCode = randomCode ?? (() => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0'));

  /** Состояние всех предложений по журналу. */
  function state() {
    const items = new Map();
    for (const event of journal.read()) {
      if (event.type === 'proposal') {
        items.set(event.id, { ...event, status: event.channel ? 'waiting' : 'no_channel', attempts: 0 });
        continue;
      }
      const item = items.get(event.id);
      if (!item) continue;
      if (event.type === 'confirm_failed') {
        item.attempts += 1;
        if (item.attempts >= config.maxCodeAttempts) item.status = 'locked';
      }
      if (event.type === 'applied') item.status = 'applied';
      if (event.type === 'apply_failed') item.status = 'failed';
    }
    const moment = now().getTime();
    for (const item of items.values()) {
      if (item.status === 'waiting' && Date.parse(item.expires) < moment) item.status = 'expired';
    }
    return items;
  }

  function nextId(items) {
    return `pr-${String(items.size + 1).padStart(4, '0')}`;
  }

  /**
   * Записать предложение и отправить код владельцу. `change` — то, что
   * выполнит `apply_confirmed`; агент видит его целиком, владелец — сводку.
   */
  async function create({ kind, direction, directionTitle, campaignId, campaignName, change, summary, effect, reason }) {
    const items = state();
    const id = nextId(items);
    const expires = new Date(now().getTime() + config.confirmTtlHours * 3_600_000).toISOString();
    const proposal = { id, kind, direction, directionTitle, campaignId, campaignName, change, summary, effect, reason: reason ?? null, expires };

    if (!telegram) {
      journal.append({ type: 'proposal', ...proposal, channel: false });
      return { id, status: 'no_channel', message: 'Канал владельца не настроен: предложение записано, кода нет, применить нельзя.' };
    }

    const code = nextCode();
    const salt = crypto.randomBytes(16).toString('hex');
    // Сначала отправка, потом запись: предложение без доставленного кода
    // подтвердить нельзя, и в журнале оно числилось бы ждущим зря.
    await telegram.send(ownerMessage(proposal, code));
    journal.append({ type: 'proposal', ...proposal, channel: true, salt, hash: digest(salt, id, code) });
    return { id, status: 'waiting', message: 'Код подтверждения отправлен владельцу. Применение — только с кодом от владельца.' };
  }

  /** Проверка кода; неверный код записывается и считается попыткой. */
  function verify(id, code) {
    const item = state().get(id);
    if (!item) throw new Error(`Нет предложения ${id}`);
    if (item.status === 'no_channel') throw new Error(`${id}: кода нет, канал владельца не был настроен`);
    if (item.status === 'applied') throw new Error(`${id} уже применено: код одноразовый`);
    if (item.status === 'failed') throw new Error(`${id}: применение уже завершилось ошибкой, нужно новое предложение`);
    if (item.status === 'locked') throw new Error(`${id} заблокировано после ${config.maxCodeAttempts} неверных кодов`);
    if (item.status === 'expired') throw new Error(`${id}: срок кода истёк, нужно новое предложение`);
    if (!/^\d{6}$/.test(String(code ?? '')) || !sameDigest(item.hash, digest(item.salt, id, String(code)))) {
      journal.append({ type: 'confirm_failed', id });
      throw new Error(`${id}: код не подходит`);
    }
    return item;
  }

  function markApplied(id, result) {
    journal.append({ type: 'applied', id, result });
  }

  function markFailed(id, error) {
    journal.append({ type: 'apply_failed', id, error });
  }

  /** Список без соли и отпечатков — для агента. */
  function list() {
    return [...state().values()].map(({ salt, hash, channel, type, at, ...rest }) => ({ created: at, ...rest }));
  }

  return { create, verify, markApplied, markFailed, list, state };
}
