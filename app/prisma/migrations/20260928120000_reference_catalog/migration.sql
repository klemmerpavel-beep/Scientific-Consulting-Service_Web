-- Справочник типов сопровождения, их написаний в книге заказов и таблица
-- заливок (решение Р-267).
--
-- Прежде справочник наполнялся отдельной командой после первого
-- развёртывания (`seed:reference`), и выкат её не выполнял. Без позиций
-- справочника мост книги отклонял строки «Диплом», «Статья», «НИР», а в
-- карточке заявки выбор вида работы был неполным. Миграции выполняются при
-- каждом выкате, поэтому номенклатура теперь заводится сама.
--
-- Состав совпадает с `scripts/seed-reference.ts`. Существующие записи не
-- трогаются (ON CONFLICT DO NOTHING): правки руководителя в кабинете и
-- привязки написаний, сделанные на экране переноса, старше этой миграции.

INSERT INTO "ServiceType" ("id", "code", "name", "sortOrder") VALUES
  ('st_' || md5('dissertation'), 'dissertation', 'Сопровождение диссертационного исследования', 10),
  ('st_' || md5('postgrad'), 'postgrad', 'Сопровождение поступления и обучения в аспирантуре', 20),
  ('st_' || md5('consulting'), 'consulting', 'Научный консалтинг и сопровождение до защиты', 30),
  ('st_' || md5('research'), 'research', 'НИР, НИОКР и отчётные материалы', 40),
  ('st_' || md5('article'), 'article', 'Научные публикации и патентные материалы', 50),
  ('st_' || md5('diploma'), 'diploma', 'Сопровождение выпускной квалификационной работы', 60)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "ServiceTypeAlias" ("id", "alias", "serviceTypeId")
SELECT 'sta_' || md5(a.alias), a.alias, t."id"
FROM (VALUES
  ('диссертация', 'dissertation'), ('кандидатская диссертация', 'dissertation'), ('докторская диссертация', 'dissertation'),
  ('аспирантура', 'postgrad'), ('поступление в аспирантуру', 'postgrad'), ('пакет аспирантуры', 'postgrad'),
  ('консультационное сопровождение', 'consulting'), ('сопровождение до защиты', 'consulting'), ('консалтинг', 'consulting'),
  ('нир', 'research'), ('ниокр', 'research'), ('отчет нир', 'research'), ('презентация по отчету нир', 'research'),
  ('статья', 'article'), ('статья вак', 'article'), ('обзорная статья', 'article'), ('патент', 'article'),
  ('дипломная работа', 'diploma'), ('специалитет', 'diploma'), ('бакалавриат', 'diploma'), ('магистратура', 'diploma')
) AS a(alias, code)
JOIN "ServiceType" t ON t."code" = a.code
ON CONFLICT ("alias") DO NOTHING;

INSERT INTO "ImportColorMap" ("argb", "mapsTo", "description") VALUES
  ('FF00B050', 'CLOSED', 'Зелёная: работа доведена'),
  ('FFFFFF00', 'IN_WORK', 'Жёлтая: работа идёт'),
  ('FF00B0F0', 'ON_START', 'Голубая: работа на старте'),
  ('FFFF0000', 'STOPPED', 'Красная: работа остановлена')
ON CONFLICT ("argb") DO NOTHING;
