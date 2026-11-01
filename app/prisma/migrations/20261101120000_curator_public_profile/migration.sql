-- П-1, Р-764: обезличенный профиль куратора для клиента.
--
-- Стаж и публикации за пять лет числом по категориям журналов (ВАК К1,
-- К2, К3; RSCI; Scopus и Web of Science), день сверки; согласие куратора
-- на камеру на созвоне знакомства (П-6) и отметка согласия на витрину
-- кураторов на сайте (п. 3.2). Прежним профилям — пусто и «без согласия».
-- Числа не отрицательны: проверку держит и база.
ALTER TABLE "ExpertProfile"
  ADD COLUMN "experienceYears" INTEGER,
  ADD COLUMN "pubK1" INTEGER,
  ADD COLUMN "pubK2" INTEGER,
  ADD COLUMN "pubK3" INTEGER,
  ADD COLUMN "pubRsci" INTEGER,
  ADD COLUMN "pubIntl" INTEGER,
  ADD COLUMN "pubCheckedOn" TIMESTAMP(3),
  ADD COLUMN "cameraConsent" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "showcaseConsentAt" TIMESTAMP(3);

ALTER TABLE "ExpertProfile"
  ADD CONSTRAINT "ExpertProfile_public_numbers_check" CHECK (
    ("experienceYears" IS NULL OR "experienceYears" >= 0)
    AND ("pubK1" IS NULL OR "pubK1" >= 0)
    AND ("pubK2" IS NULL OR "pubK2" >= 0)
    AND ("pubK3" IS NULL OR "pubK3" >= 0)
    AND ("pubRsci" IS NULL OR "pubRsci" >= 0)
    AND ("pubIntl" IS NULL OR "pubIntl" >= 0)
  );
