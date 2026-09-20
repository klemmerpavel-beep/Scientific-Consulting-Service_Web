-- Индексы под выборки, которые до сих пор шли обходом таблицы целиком,
-- и снятие дублирующего индекса года (решение Р-185).

-- Счётчик непрочитанного: работа плюс признак прочтения.
CREATE INDEX "Message_projectId_readAt_idx" ON "Message"("projectId", "readAt");

-- Сводка помеченных передачей контактов: полсотни свежих строк.
CREATE INDEX "Message_containsContactHint_createdAt_idx" ON "Message"("containsContactHint", "createdAt");

-- Журнал доступа к файлам без отбора и с отбором по виду действия.
CREATE INDEX "FileAccessLog_occurredAt_idx" ON "FileAccessLog"("occurredAt");
CREATE INDEX "FileAccessLog_action_occurredAt_idx" ON "FileAccessLog"("action", "occurredAt");

-- Сводка очереди уведомлений: ушедшее за сутки и время последней отправки.
CREATE INDEX "NotificationOutbox_state_sentAt_idx" ON "NotificationOutbox"("state", "sentAt");

-- Итоги по годам: выплаченное по всей практике и начатое за год.
CREATE INDEX "ExpertPayout_status_paidOn_idx" ON "ExpertPayout"("status", "paidOn");
CREATE INDEX "Project_startedOn_idx" ON "Project"("startedOn");

-- Перечень видов действий для отбора журнала.
CREATE INDEX "AuditEvent_action_idx" ON "AuditEvent"("action");

-- Год уже уникален: второй индекс по тому же столбцу только удорожает запись.
DROP INDEX IF EXISTS "YearlyFinance_year_idx";
