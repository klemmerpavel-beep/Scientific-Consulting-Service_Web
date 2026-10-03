-- Публикация версии эксперта клиенту (требование Т-18, решение Р-294).
CREATE TABLE "VersionModeration" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "status" "ModerationStatus" NOT NULL DEFAULT 'PENDING',
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VersionModeration_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VersionModeration_versionId_key" ON "VersionModeration"("versionId");

CREATE INDEX "VersionModeration_status_idx" ON "VersionModeration"("status");

ALTER TABLE "VersionModeration" ADD CONSTRAINT "VersionModeration_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "MaterialVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
