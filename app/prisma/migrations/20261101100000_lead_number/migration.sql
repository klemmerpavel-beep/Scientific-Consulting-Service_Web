-- П-3, Р-763: сквозной номер заявки «№ N».
--
-- Итог тот же, что у `SERIAL NOT NULL`, который пишет Prisma для
-- `@default(autoincrement())`: последовательность "Lead_number_seq"
-- принадлежит столбцу и выдаёт номер при записи заявки. Но `SERIAL` на
-- таблице с данными раздал бы номера в порядке хранения строк, а прежним
-- заявкам номера даются по дате создания; при равной дате — по
-- идентификатору. Следующая заявка получает номер после наибольшего.
CREATE SEQUENCE "Lead_number_seq" AS INTEGER;

ALTER TABLE "Lead" ADD COLUMN "number" INTEGER;

UPDATE "Lead" AS l
SET "number" = n.rn
FROM (SELECT "id", row_number() OVER (ORDER BY "createdAt", "id") AS rn FROM "Lead") AS n
WHERE l."id" = n."id";

SELECT setval('"Lead_number_seq"', COALESCE((SELECT max("number") FROM "Lead"), 0) + 1, false);

ALTER TABLE "Lead" ALTER COLUMN "number" SET DEFAULT nextval('"Lead_number_seq"');
ALTER TABLE "Lead" ALTER COLUMN "number" SET NOT NULL;
ALTER SEQUENCE "Lead_number_seq" OWNED BY "Lead"."number";

CREATE UNIQUE INDEX "Lead_number_key" ON "Lead"("number");
