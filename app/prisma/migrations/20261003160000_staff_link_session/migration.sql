-- Ссылка входа, выданная сотрудником, и сессия по ней (ОМ-3, требование
-- М-12, решение Р-292).
ALTER TABLE "LoginToken" ADD COLUMN "issuedById" TEXT;

ALTER TABLE "Session" ADD COLUMN "viaStaffLink" BOOLEAN NOT NULL DEFAULT false;
