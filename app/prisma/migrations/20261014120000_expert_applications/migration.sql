-- Анкеты экспертов со страницы сайта «Экспертам» (замечание владельца
-- 13.10.2026, решение Р-580): анкета и её файлы. Адрес соединения и
-- строка браузера не хранятся; срок хранения — шесть месяцев (Политика,
-- п. 7.4), чистка — deploy/retention.sh.
-- CreateEnum
CREATE TYPE "ExpertApplicationStatus" AS ENUM ('NEW', 'REVIEW', 'INVITED', 'DECLINED');

-- CreateTable
CREATE TABLE "ExpertApplication" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "degree" TEXT NOT NULL,
    "speciality" TEXT,
    "fields" TEXT NOT NULL,
    "experience" TEXT NOT NULL,
    "links" TEXT,
    "consentVersion" TEXT NOT NULL,
    "status" "ExpertApplicationStatus" NOT NULL DEFAULT 'NEW',
    "statusChangedAt" TIMESTAMP(3),
    "note" TEXT,

    CONSTRAINT "ExpertApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpertApplicationFile" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "sha256" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpertApplicationFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExpertApplication_status_createdAt_idx" ON "ExpertApplication"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ExpertApplication_createdAt_idx" ON "ExpertApplication"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExpertApplicationFile_storageKey_key" ON "ExpertApplicationFile"("storageKey");

-- CreateIndex
CREATE INDEX "ExpertApplicationFile_applicationId_idx" ON "ExpertApplicationFile"("applicationId");

-- AddForeignKey
ALTER TABLE "ExpertApplicationFile" ADD CONSTRAINT "ExpertApplicationFile_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "ExpertApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
