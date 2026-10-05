-- Причина неудачи строки очереди: дело на «Сводке» и сигнал руководителю
-- даёт только отказ доставки (требование РК-02, решение Р-334).
CREATE TYPE "OutboxFailure" AS ENUM ('DELIVERY', 'RECIPIENT_OFF', 'NO_ADDRESS');
ALTER TABLE "NotificationOutbox" ADD COLUMN "failure" "OutboxFailure";

-- Прежние неудачи разбираются по тексту причины, который писала отправка.
UPDATE "NotificationOutbox" SET "failure" = CASE
  WHEN "lastError" = 'получатель отключил канал или доступ закрыт' THEN 'RECIPIENT_OFF'::"OutboxFailure"
  WHEN "lastError" = 'привязка Telegram снята' THEN 'RECIPIENT_OFF'::"OutboxFailure"
  WHEN "lastError" = 'адрес заявителя недоступен' THEN 'NO_ADDRESS'::"OutboxFailure"
  ELSE 'DELIVERY'::"OutboxFailure"
END
WHERE "state" = 'FAILED';
