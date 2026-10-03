-- Т-06, Р-309: экран события в строке очереди и путь возврата в токене входа.
ALTER TABLE "NotificationOutbox" ADD COLUMN "path" TEXT;
ALTER TABLE "LoginToken" ADD COLUMN "returnPath" TEXT;
