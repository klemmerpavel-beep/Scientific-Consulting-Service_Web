-- Годовые итоги практики, вводимые руководителем вручную.
-- Рядом кабинет считает свой итог из договоров и выплат; расхождение между
-- введённым и посчитанным показывается, а не прячется (решение Р-156).
CREATE TABLE "YearlyFinance" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "revenue" BIGINT NOT NULL,
    "costs" BIGINT NOT NULL,
    "note" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "YearlyFinance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "YearlyFinance_year_key" ON "YearlyFinance"("year");
CREATE INDEX "YearlyFinance_year_idx" ON "YearlyFinance"("year");

-- Автор записи может быть удалён из кабинета; сама цифра при этом остаётся.
ALTER TABLE "YearlyFinance" ADD CONSTRAINT "YearlyFinance_updatedById_fkey"
    FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
