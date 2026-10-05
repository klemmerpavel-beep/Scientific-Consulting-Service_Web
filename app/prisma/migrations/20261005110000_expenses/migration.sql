-- Расходы практики по месяцам и справочник статей (требование РК-21,
-- решение Р-353). Четыре статьи по умолчанию.
CREATE TABLE "ExpenseCategory" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "ExpenseCategory_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ExpenseCategory_name_key" ON "ExpenseCategory"("name");

INSERT INTO "ExpenseCategory" ("id", "name", "position") VALUES
  ('promotion', 'Реклама и продвижение', 1),
  ('services', 'Сервисы и программы', 2),
  ('contractors', 'Подрядчики, кроме кураторов', 3),
  ('other', 'Прочие расходы', 4);

CREATE TABLE "Expense" (
  "id" TEXT NOT NULL,
  "month" TIMESTAMP(3) NOT NULL,
  "categoryId" TEXT NOT NULL,
  "amount" BIGINT NOT NULL,
  "note" TEXT,
  "serviceTypeId" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Expense_month_idx" ON "Expense"("month");
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_serviceTypeId_fkey"
  FOREIGN KEY ("serviceTypeId") REFERENCES "ServiceType"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
