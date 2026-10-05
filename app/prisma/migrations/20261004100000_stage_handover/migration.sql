-- Сдача этапа куратором менеджеру (требование Э-05, решение Р-325).
-- Новое состояние этапа не заводится: пометка и записка — поля этапа.
ALTER TABLE "Stage" ADD COLUMN "handedOverAt" TIMESTAMP(3),
ADD COLUMN "handoverNote" TEXT,
ADD COLUMN "handbackAt" TIMESTAMP(3),
ADD COLUMN "handbackReason" TEXT;
