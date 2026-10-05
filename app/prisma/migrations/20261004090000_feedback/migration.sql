-- Замечания о страницах с виджета (решение Р-403). Таблица не связана
-- ни с учётными записями, ни с сессиями: персональных данных в ней нет
-- по устройству, и удаление данных субъекта её не касается.

-- CreateEnum
CREATE TYPE "FeedbackArea" AS ENUM ('SITE', 'CABINET');

-- CreateEnum
CREATE TYPE "FeedbackSeverity" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "FeedbackStatus" AS ENUM ('NEW', 'IN_WORK', 'FIXED', 'REJECTED');

-- CreateTable
CREATE TABLE "Feedback" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "area" "FeedbackArea" NOT NULL,
    "pathTemplate" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "device" TEXT NOT NULL,
    "viewportWidth" INTEGER,
    "screenshotKey" TEXT,
    "screenshotType" TEXT,
    "screenshotSize" INTEGER,
    "severityAuto" "FeedbackSeverity" NOT NULL,
    "severity" "FeedbackSeverity" NOT NULL,
    "status" "FeedbackStatus" NOT NULL DEFAULT 'NEW',
    "note" TEXT,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Feedback_status_createdAt_idx" ON "Feedback"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Feedback_createdAt_idx" ON "Feedback"("createdAt");

