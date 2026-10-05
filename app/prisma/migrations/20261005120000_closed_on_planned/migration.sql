-- Плановая дата закрытия (требование РК-23, решение Р-355).
ALTER TABLE "Project" ADD COLUMN "closedOnPlanned" BOOLEAN NOT NULL DEFAULT false;

-- Дата закрытия без события смены состояния — плановый срок: строки
-- перенесённой книги заказов и ручные заказы, заведённые завершёнными.
-- Работа, закрытая переводом в кабинете, несёт событие и остаётся с
-- фактической датой.
UPDATE "Project" p
SET "closedOnPlanned" = true
WHERE p."closedOn" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "ProjectEvent" e
    WHERE e."projectId" = p."id" AND e."kind" = 'PROJECT_STATUS_CHANGED'
  );
