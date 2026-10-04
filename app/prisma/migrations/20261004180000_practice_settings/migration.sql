-- Настройки практики «ключ — значение» (требование РК-05, решение Р-337):
-- первая — срок реакции в рабочих днях; вторая очередь кладёт сюда дату
-- начала учёта и пороги уверенности (РК-16).
CREATE TABLE "PracticeSetting" (
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "updatedById" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PracticeSetting_pkey" PRIMARY KEY ("key")
);
ALTER TABLE "PracticeSetting" ADD CONSTRAINT "PracticeSetting_updatedById_fkey"
  FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
