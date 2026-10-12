-- Оценка сопровождения клиентом после завершения работы (улучшение У-4,
-- решение Р-565): одна на работу, 1–5, необязательный отзыв, разрешение
-- на публикацию. Менеджер и куратор — снимок на момент оценки.
-- CreateTable
CREATE TABLE "WorkRating" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "text" TEXT,
    "publishAllowed" BOOLEAN NOT NULL DEFAULT false,
    "managerId" TEXT,
    "expertId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkRating_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkRating_projectId_key" ON "WorkRating"("projectId");

-- CreateIndex
CREATE INDEX "WorkRating_managerId_idx" ON "WorkRating"("managerId");

-- CreateIndex
CREATE INDEX "WorkRating_expertId_idx" ON "WorkRating"("expertId");

-- AddForeignKey
ALTER TABLE "WorkRating" ADD CONSTRAINT "WorkRating_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkRating" ADD CONSTRAINT "WorkRating_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkRating" ADD CONSTRAINT "WorkRating_expertId_fkey" FOREIGN KEY ("expertId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Оценка — целое от 1 до 5: предел держит и база, а не только форма.
ALTER TABLE "WorkRating" ADD CONSTRAINT "WorkRating_score_check" CHECK ("score" BETWEEN 1 AND 5);
