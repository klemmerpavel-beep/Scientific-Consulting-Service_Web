-- Роль эксперта в работе и шифр научной специальности (требование Т-11,
-- решение Р-297).
CREATE TYPE "ExpertRole" AS ENUM ('SUBJECT_EXPERT', 'METHODOLOGIST', 'SCIENCE_EDITOR');

ALTER TABLE "Project" ADD COLUMN "expertRole" "ExpertRole";

ALTER TABLE "ExpertProfile" ADD COLUMN "specialtyCode" TEXT;
