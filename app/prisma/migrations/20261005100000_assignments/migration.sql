-- Поручения руководителя менеджеру или куратору (требование РК-19,
-- решение Р-352; В-19).
CREATE TYPE "AssignmentStatus" AS ENUM ('ASSIGNED', 'IN_PROGRESS', 'DONE', 'WITHDRAWN');

CREATE TABLE "Assignment" (
  "id" TEXT NOT NULL,
  "assigneeId" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "dueOn" TIMESTAMP(3) NOT NULL,
  "projectId" TEXT,
  "status" "AssignmentStatus" NOT NULL DEFAULT 'ASSIGNED',
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "doneAt" TIMESTAMP(3),
  CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Assignment_assigneeId_status_idx" ON "Assignment"("assigneeId", "status");
CREATE INDEX "Assignment_status_dueOn_idx" ON "Assignment"("status", "dueOn");
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_assigneeId_fkey"
  FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
