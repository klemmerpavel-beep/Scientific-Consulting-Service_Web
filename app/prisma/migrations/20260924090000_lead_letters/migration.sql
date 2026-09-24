-- Письмо заявителю, которому отказали: адресат очереди — заявка, а не
-- учётная запись (решение Р-217). Ровно один адресат у каждой строки.

ALTER TABLE "NotificationOutbox" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "NotificationOutbox" ADD COLUMN "leadId" TEXT;

CREATE INDEX "NotificationOutbox_leadId_idx" ON "NotificationOutbox"("leadId");

ALTER TABLE "NotificationOutbox" ADD CONSTRAINT "NotificationOutbox_leadId_fkey"
    FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NotificationOutbox" ADD CONSTRAINT "NotificationOutbox_one_recipient"
    CHECK (("userId" IS NULL) <> ("leadId" IS NULL));
