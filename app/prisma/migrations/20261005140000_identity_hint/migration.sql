-- ФИО куратора в имени файла или в свойствах документа (улучшение УК-03, решение Р-396).
ALTER TABLE "VersionModeration" ADD COLUMN "identityHint" BOOLEAN NOT NULL DEFAULT false;
