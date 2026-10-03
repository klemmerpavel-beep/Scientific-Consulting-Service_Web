-- Клиент возвращает этап с замечаниями (требование Т-03, решение Р-281).
-- Способ перехода отличает согласование и возврат клиентом от перевода
-- практикой; пометка контактов — текст замечаний с телефоном или почтой,
-- который эксперт не видит (О-5).
CREATE TYPE "StageChangeVia" AS ENUM ('MANUAL', 'CLIENT_APPROVE', 'CLIENT_RETURN');

ALTER TABLE "StageStateChange"
  ADD COLUMN "via" "StageChangeVia" NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "contactHint" BOOLEAN NOT NULL DEFAULT false;

-- Пометка «возвращён с замечаниями» гаснет при новой сдаче; отметка
-- «замечания приняты в работу» закрывает дело куратора (М-04).
ALTER TABLE "Stage"
  ADD COLUMN "returnedAt" TIMESTAMP(3),
  ADD COLUMN "returnAckAt" TIMESTAMP(3);
