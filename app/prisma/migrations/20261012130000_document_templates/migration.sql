-- Шаблоны документов практики, загруженные руководителем (задание владельца
-- 12.10.2026, решение Р-562): договор, техническое задание, памятки. Файл —
-- в хранилище, строка — название, адресат и свёртка файла.
-- CreateEnum
CREATE TYPE "TemplateAudience" AS ENUM ('STAFF', 'ALL');

-- CreateTable
CREATE TABLE "DocumentTemplate" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "note" TEXT,
    "audience" "TemplateAudience" NOT NULL DEFAULT 'STAFF',
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "sha256" TEXT NOT NULL,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "DocumentTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DocumentTemplate_storageKey_key" ON "DocumentTemplate"("storageKey");

-- CreateIndex
CREATE INDEX "DocumentTemplate_deletedAt_title_idx" ON "DocumentTemplate"("deletedAt", "title");

-- AddForeignKey
ALTER TABLE "DocumentTemplate" ADD CONSTRAINT "DocumentTemplate_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

