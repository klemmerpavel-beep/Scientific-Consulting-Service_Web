-- Куратор без договора поручения сообщает руководителю, что ждёт его
-- (требование Э-12, решение Р-331; дело руководителя — РК-09).
ALTER TABLE "ExpertProfile" ADD COLUMN "ndaRequestedAt" TIMESTAMP(3);
