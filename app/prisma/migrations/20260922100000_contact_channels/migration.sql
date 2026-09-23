-- Человек говорит, как с ним связываться, а руководитель — какое событие
-- каким каналом приходит (решение Р-198).

CREATE TYPE "ContactKind" AS ENUM ('EMAIL', 'TELEGRAM', 'PHONE_CALL', 'MESSENGER', 'FULL_SUPPORT');

CREATE TABLE "ContactChannel" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "ContactKind" NOT NULL,
    "value" TEXT,
    "note" TEXT,
    "preferred" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactChannel_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ContactChannel_userId_idx" ON "ContactChannel"("userId");

ALTER TABLE "ContactChannel" ADD CONSTRAINT "ContactChannel_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "NotifyRule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventKind" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "NotifyRule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NotifyRule_userId_eventKind_channel_key" ON "NotifyRule"("userId", "eventKind", "channel");
CREATE INDEX "NotifyRule_userId_idx" ON "NotifyRule"("userId");

ALTER TABLE "NotifyRule" ADD CONSTRAINT "NotifyRule_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
