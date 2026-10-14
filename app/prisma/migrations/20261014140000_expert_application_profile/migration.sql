-- Профессиональная анкета кандидата (решение Р-584): квалификация, виды
-- работ, отметки опыта, авторские профили, загрузка. Все поля
-- необязательны для прежних анкет; виды работ обязательны в новой форме и
-- проверяются при приёме.
ALTER TABLE "ExpertApplication"
  ADD COLUMN "academicTitle" TEXT,
  ADD COLUMN "workplace" TEXT,
  ADD COLUMN "seniority" TEXT,
  ADD COLUMN "services" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "roles" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "elibrarySpin" TEXT,
  ADD COLUMN "orcid" TEXT,
  ADD COLUMN "weeklyHours" TEXT;
