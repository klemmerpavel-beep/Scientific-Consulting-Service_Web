-- Суть выполнения этапа и короткое описание работы: их заполняет менеджер,
-- а видит клиент на экране заказа (решение Р-190).
ALTER TABLE "Stage" ADD COLUMN "summary" TEXT;
ALTER TABLE "Project" ADD COLUMN "summary" TEXT;
