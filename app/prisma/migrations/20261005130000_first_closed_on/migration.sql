-- Первая дата закрытия работы (улучшение УМ-13, решение Р-392).
ALTER TABLE "Project" ADD COLUMN "firstClosedOn" TIMESTAMP(3);

-- Первая дата — день первого перевода в «Завершена» или «Отменена» по
-- московскому календарю; без такого события (перенос книги, ручной заказ)
-- — нынешняя дата закрытия.
UPDATE "Project" p
SET "firstClosedOn" = COALESCE(
  (
    SELECT ((min(e."createdAt") AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Moscow')::date::timestamp
    FROM "ProjectEvent" e
    WHERE e."projectId" = p."id"
      AND e."kind" = 'PROJECT_STATUS_CHANGED'
      AND e."payload"->>'to' IN ('COMPLETED', 'CANCELLED')
  ),
  p."closedOn"
)
WHERE p."closedOn" IS NOT NULL
   OR EXISTS (
     SELECT 1 FROM "ProjectEvent" e
     WHERE e."projectId" = p."id"
       AND e."kind" = 'PROJECT_STATUS_CHANGED'
       AND e."payload"->>'to' IN ('COMPLETED', 'CANCELLED')
   );
