-- Отметки шагов чек-листа вида работы по работе (задание владельца
-- 12.10.2026, решение Р-551). Текст чек-листа — в коде, здесь только факт:
-- шаг сделан, кем и когда.
-- CreateTable
CREATE TABLE "ChecklistMark" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "checklistKey" TEXT NOT NULL,
    "stepKey" TEXT NOT NULL,
    "doneById" TEXT,
    "doneAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChecklistMark_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChecklistMark_projectId_checklistKey_stepKey_key" ON "ChecklistMark"("projectId", "checklistKey", "stepKey");

-- AddForeignKey
ALTER TABLE "ChecklistMark" ADD CONSTRAINT "ChecklistMark_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistMark" ADD CONSTRAINT "ChecklistMark_doneById_fkey" FOREIGN KEY ("doneById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

