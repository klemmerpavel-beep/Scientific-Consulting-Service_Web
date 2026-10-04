-- Транш с этапом и дела руководителя «акт и счёт» (требование РК-12,
-- решение Р-338).
ALTER TABLE "Tranche" ADD COLUMN "stageId" TEXT;
ALTER TABLE "Tranche" ADD CONSTRAINT "Tranche_stageId_fkey"
  FOREIGN KEY ("stageId") REFERENCES "Stage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Tranche_stageId_idx" ON "Tranche"("stageId");

CREATE TYPE "HeadCheckKind" AS ENUM ('ACT_AFTER_ACCEPT', 'ACT_AFTER_REOPEN', 'CONTRACT_BY_MANAGER');
CREATE TABLE "HeadCheck" (
  "id" TEXT NOT NULL,
  "kind" "HeadCheckKind" NOT NULL,
  "projectId" TEXT NOT NULL,
  "stageId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt" TIMESTAMP(3),
  "closedById" TEXT,
  "closeNote" TEXT,
  CONSTRAINT "HeadCheck_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "HeadCheck" ADD CONSTRAINT "HeadCheck_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HeadCheck" ADD CONSTRAINT "HeadCheck_stageId_fkey"
  FOREIGN KEY ("stageId") REFERENCES "Stage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HeadCheck" ADD CONSTRAINT "HeadCheck_closedById_fkey"
  FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "HeadCheck_closedAt_createdAt_idx" ON "HeadCheck"("closedAt", "createdAt");
CREATE INDEX "HeadCheck_projectId_idx" ON "HeadCheck"("projectId");
