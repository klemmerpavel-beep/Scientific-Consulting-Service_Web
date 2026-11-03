-- П. 2.8 задания, Р-766: первый ответ на заявку.
--
-- Первый ответ — первая смена состояния заявки менеджером или
-- руководителем из «Новой». Пишется один раз; по нему считаются дело
-- «Заявка ждёт ответа N ч» на «Сегодня» и медиана «заявка → первый ответ»
-- в «Аналитике».
ALTER TABLE "Lead" ADD COLUMN "firstResponseAt" TIMESTAMP(3);

-- Прежним заявкам — по журналу: самая ранняя запись о смене состояния,
-- одобрении или отказе. Смена плашкой засчитывается, только если она была
-- из «Новой» (заявка, помеченная при приёме машинной, «Новой» не была);
-- у одобрения и отказа прежнее состояние в журнале не записано, и они
-- засчитываются как есть. Заявки без записей журнала остаются без даты и
-- в медиану не входят.
UPDATE "Lead" AS l
SET "firstResponseAt" = first."occurredAt"
FROM (
  SELECT DISTINCT ON (e."objectId")
    e."objectId",
    e."occurredAt",
    e."action",
    e."payload"
  FROM "AuditEvent" AS e
  WHERE e."objectType" = 'Lead'
    AND e."action" IN ('LEAD_STATUS_CHANGED', 'LEAD_APPROVED', 'LEAD_DECLINED')
  ORDER BY e."objectId", e."occurredAt" ASC, e."id" ASC
) AS first
WHERE l."id" = first."objectId"
  AND l."status" <> 'NEW'
  AND l."firstResponseAt" IS NULL
  AND (first."action" <> 'LEAD_STATUS_CHANGED' OR first."payload"->>'from' = 'NEW')
  AND first."occurredAt" >= l."createdAt";
