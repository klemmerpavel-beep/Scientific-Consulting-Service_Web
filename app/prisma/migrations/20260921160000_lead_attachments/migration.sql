-- Заявка из кабинета собирает больше сведений и принимает вложения
-- (решение Р-191).
ALTER TABLE "Lead" ADD COLUMN "supervisorName" TEXT;
ALTER TABLE "Lead" ADD COLUMN "phone" TEXT;

CREATE TABLE "LeadAttachment" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "sha256" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "uploadedById" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "materialId" TEXT,
    "purgedAt" TIMESTAMP(3),

    CONSTRAINT "LeadAttachment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LeadAttachment_storageKey_key" ON "LeadAttachment"("storageKey");
CREATE INDEX "LeadAttachment_leadId_idx" ON "LeadAttachment"("leadId");

ALTER TABLE "LeadAttachment" ADD CONSTRAINT "LeadAttachment_leadId_fkey"
  FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeadAttachment" ADD CONSTRAINT "LeadAttachment_uploadedById_fkey"
  FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
