-- Срок согласования этапа, автозакрытие и производственный календарь
-- (требование Т-15, решение Р-290).
ALTER TYPE "StageChangeVia" ADD VALUE 'AUTO_ACCEPT';
ALTER TYPE "StageChangeVia" ADD VALUE 'STAFF_FOR_CLIENT';

ALTER TABLE "Project" ADD COLUMN "approvalDays" INTEGER NOT NULL DEFAULT 5;

ALTER TABLE "Stage" ADD COLUMN "approvalSentAt" TIMESTAMP(3),
ADD COLUMN "approvalDueOn" TIMESTAMP(3),
ADD COLUMN "approvalDaysLeft" INTEGER;

CREATE INDEX "Stage_state_approvalDueOn_idx" ON "Stage"("state", "approvalDueOn");

CREATE TABLE "CalendarDay" (
    "day" TIMESTAMP(3) NOT NULL,
    "workday" BOOLEAN NOT NULL,
    "note" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarDay_pkey" PRIMARY KEY ("day")
);

-- Перенос выходного дня с воскресенья 4 января 2026 г. на четверг
-- 31 декабря 2026 г. (постановление Правительства РФ о переносе выходных
-- дней в 2026 году). Праздники ст. 112 ТК РФ модуль рабочих дней знает
-- сам; переносы следующих лет вносит руководитель.
INSERT INTO "CalendarDay" ("day", "workday", "note", "updatedAt")
VALUES ('2026-12-31 00:00:00', false, 'Перенос выходного дня с 4 января 2026 г.', CURRENT_TIMESTAMP);
