-- Давность состояния заявки для рабочего экрана «Сегодня» (требование М-06,
-- решение Р-304). Существующие заявки получают дату создания.
ALTER TABLE "Lead" ADD COLUMN "statusChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "Lead" SET "statusChangedAt" = "createdAt";
