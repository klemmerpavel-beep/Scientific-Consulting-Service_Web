-- Сводка писем куратору раз в день (улучшение УЭ-01, решение Р-398).
ALTER TABLE "User" ADD COLUMN "dailyDigest" BOOLEAN NOT NULL DEFAULT false;
ALTER TYPE "NotificationState" ADD VALUE 'MERGED';
