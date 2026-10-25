/**
 * Правила «Какое событие каким каналом» без молчаливой потери уведомлений
 * (решение Р-736).
 *
 * Telegram берётся, только когда у человека привязан чат (`outbox.ts`,
 * Р-198). Пока чата нет, флажки столбца Telegram на экране неактивны, а
 * неактивный флажок форма не отправляет: без правила ниже первое же
 * «Сохранить правила» записало бы все правила Telegram выключенными, и
 * после привязки чата уведомления в Telegram не пришли бы ни по одному
 * событию. Поэтому без привязанного чата сохраняется только почта, а
 * сохранённые правила Telegram остаются как были; привязка проверяется на
 * сервере, а не по виду формы.
 *
 * Снятое у события «письмом» при неподключённом Telegram означает, что о
 * нём не сообщат вовсе: экран называет такие события.
 *
 * Модуль чистый: данные собирает экран и `saveRules`, здесь — правила.
 */

export type RuleChannel = 'EMAIL' | 'TELEGRAM';

export interface RuleInput {
  readonly eventKind: string;
  readonly channel: RuleChannel;
  readonly enabled: boolean;
}

/** Какие каналы перезаписываются сохранением: без чата Telegram — только почта. */
export function savedChannels(telegramBound: boolean): readonly RuleChannel[] {
  return telegramBound ? ['EMAIL', 'TELEGRAM'] : ['EMAIL'];
}

/** Правила, которые сохранение записывает: правила неподключённого Telegram не трогаются. */
export function savableRules<T extends RuleInput>(rules: readonly T[], telegramBound: boolean): T[] {
  const channels = savedChannels(telegramBound);
  return rules.filter((rule) => channels.includes(rule.channel));
}

/**
 * События, о которых не сообщат ни одним каналом: почта выключена целиком
 * или снята у события, а Telegram не подключён, выключен или снят.
 */
export function silentEvents<T extends { readonly kind: string }>(
  events: readonly T[],
  ruleOn: (kind: string, channel: RuleChannel) => boolean,
  channels: { readonly email: boolean; readonly telegram: boolean },
): T[] {
  return events.filter(
    (event) => !(channels.email && ruleOn(event.kind, 'EMAIL')) && !(channels.telegram && ruleOn(event.kind, 'TELEGRAM')),
  );
}
