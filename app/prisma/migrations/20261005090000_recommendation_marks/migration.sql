-- Отметки рекомендаций «сделано» и «отложено» (требования РК-16, РК-17,
-- решение Р-349). Ключ — экземпляр рекомендации, отметка общая для практики.
CREATE TYPE "RecommendationMarkStatus" AS ENUM ('DONE', 'POSTPONED');

CREATE TABLE "RecommendationMark" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "status" "RecommendationMarkStatus" NOT NULL,
  "userId" TEXT,
  "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RecommendationMark_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RecommendationMark_key_key" ON "RecommendationMark"("key");
ALTER TABLE "RecommendationMark" ADD CONSTRAINT "RecommendationMark_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
