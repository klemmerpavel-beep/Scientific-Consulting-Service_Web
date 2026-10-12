/**
 * Канал владельца для кодов подтверждения — Telegram-бот.
 *
 * Код уходит владельцу мимо агента: агент получает только номер
 * предложения. Без настроенного канала сервер предложения записывает, но
 * кодов не выдаёт, и применить их нельзя.
 */

export function createTelegram({ botToken, chatId, fetchImpl = globalThis.fetch }) {
  if (!botToken || !chatId) return null;
  return {
    async send(text) {
      const response = await fetchImpl(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
      });
      if (!response.ok) throw new Error(`Telegram ${response.status}: код владельцу не отправлен`);
    },
  };
}
