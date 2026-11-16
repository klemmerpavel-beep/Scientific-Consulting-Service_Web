-- Разбор отработанных замечаний владельца с кнопки по выгрузке 16.11.2026
-- (решение Р-952; порядок — Р-583, Р-832: отработанное замечание отмечается
-- миграцией выпуска, ключа выгрузки у исполнителя кода нет).
--
-- В выгрузке 16.11.2026 пять замечаний по сайту стояли «новыми». Два из них
-- отработаны этим выпуском: просветы между разделами (Р-946, Р-950) и
-- увеличение портретов первого экрана при наведении (Р-947, Р-951). Три
-- остаются «новыми» и миграцией не трогаются: блок конкурента как образец
-- (ждёт снимка), чат с менеджером и плашка о cookies (ждут решения
-- владельца).
--
-- Трогаются только замечания в состоянии «новое»: разбор руководителя не
-- перетирается, повторный прогон ничего не меняет. На базе без этих
-- замечаний (CI, снимки, разработка) миграция ничего не делает. Дата
-- закрытия — время выката (UTC). В журнал действий — «Замечание разобрано»
-- с пометкой via = release.
--
-- Одна инструкция: проверка tests/feedback-release-review-1116.db.test.ts
-- прогоняет этот файл на базе целиком.
WITH v (id, status, note, resolved) AS (
  VALUES
    ('cmwgwyrz1000001pgvzwy47p8', 'FIXED',
     'Р-946, Р-950: просветы между разделами больше на 10—14 %: на посадочной отступы 70, 80 и 122 px (было 62, 70 и 106), на «Аспирантам», «Студентам», «Компаниям» и «Экспертам» — 80—126 px вместо 72—112; содержимое разделов не менялось.',
     NULL::timestamp),
    ('cmw6x7z1d000001n3o2fmmiru', 'FIXED',
     'Р-947, Р-951: портреты куратора и менеджера на первом экране посадочной, «Аспирантам», «Студентам» и «Компаниям» под курсором крупнее на 28 %; на телефоне и при уменьшенном движении стоят на месте.',
     NULL)
),
done AS (
  UPDATE "Feedback" AS f
     SET status = v.status::"FeedbackStatus",
         note = v.note,
         "resolvedAt" = CASE WHEN v.status = 'FIXED' THEN COALESCE(v.resolved, now() AT TIME ZONE 'UTC') END,
         "updatedAt" = now() AT TIME ZONE 'UTC'
    FROM v
   WHERE f.id = v.id
     AND f.status = 'NEW'
  RETURNING f.id, v.status, f.severity::text AS severity
)
INSERT INTO "AuditEvent" (id, "occurredAt", action, "objectType", "objectId", payload)
SELECT 'mig' || replace(gen_random_uuid()::text, '-', ''),
       now() AT TIME ZONE 'UTC',
       'FEEDBACK_REVIEWED',
       'Feedback',
       done.id,
       jsonb_build_object(
         'status', jsonb_build_object('from', 'NEW', 'to', done.status),
         'severity', jsonb_build_object('from', done.severity, 'to', done.severity),
         'note', true,
         'via', 'release'
       )
  FROM done;
