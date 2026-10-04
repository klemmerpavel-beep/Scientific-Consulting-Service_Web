-- Ветки переписки (требование РК-07, решение Р-336): клиент — менеджер,
-- внутренняя по работе (менеджер и руководитель), руководитель — сотрудник.
-- Куратор ни в одной ветке не участвует (Р-150, ответ ОЭ-1, С-2).
CREATE TYPE "MessageThread" AS ENUM ('CLIENT_MANAGER', 'WORK_INTERNAL', 'HEAD_STAFF');

ALTER TABLE "Message" ADD COLUMN "thread" "MessageThread" NOT NULL DEFAULT 'CLIENT_MANAGER';
ALTER TABLE "Message" ADD COLUMN "staffId" TEXT;
ALTER TABLE "Message" ALTER COLUMN "projectId" DROP NOT NULL;
ALTER TABLE "Message" ADD CONSTRAINT "Message_staffId_fkey"
  FOREIGN KEY ("staffId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- У ветки «руководитель — сотрудник» нет работы, у остальных нет сотрудника.
ALTER TABLE "Message" ADD CONSTRAINT "Message_thread_target_check" CHECK (
  ("thread" = 'HEAD_STAFF' AND "projectId" IS NULL AND "staffId" IS NOT NULL)
  OR ("thread" <> 'HEAD_STAFF' AND "projectId" IS NOT NULL AND "staffId" IS NULL)
);
CREATE INDEX "Message_thread_projectId_createdAt_idx" ON "Message"("thread", "projectId", "createdAt");
CREATE INDEX "Message_thread_staffId_createdAt_idx" ON "Message"("thread", "staffId", "createdAt");

-- Курсор прочтения участника ветки: внутренние ветки читают несколько
-- человек, и отметка на самом сообщении (Р-221) им не подходит.
CREATE TABLE "MessageThreadRead" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "threadKey" TEXT NOT NULL,
  "readAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MessageThreadRead_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MessageThreadRead_userId_threadKey_key" ON "MessageThreadRead"("userId", "threadKey");
ALTER TABLE "MessageThreadRead" ADD CONSTRAINT "MessageThreadRead_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- «Спросить руководителя» заменяется веткой: отключённое остаётся
-- отключённым.
UPDATE "NotifyRule" SET "eventKind" = 'STAFF_QUESTION' WHERE "eventKind" = 'HELP_REQUESTED';
