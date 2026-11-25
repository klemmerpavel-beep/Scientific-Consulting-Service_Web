// Сгенерировано tools/seo-sync.mjs из макетов design/*.dc.html. Руками не
// править: дата страницы меняется вместе со свёрткой её макета — после
// правки макета выполнить `node tools/seo-sync.mjs` из корня репозитория
// (его же выполняет sync-check.sh). Решение Р-1010.

export const PAGE_DATES: Record<string, { layout: string; sha256: string; date: string }> = {
  "/": {
    "layout": "StartPage",
    "sha256": "ecb1b8dfd6d963a81d48ca40276ababa82639acbc1163d05abe44628853e44b6",
    "date": "2026-11-22"
  },
  "/main": {
    "layout": "MainPage",
    "sha256": "0c739c96964be089df3b93eec86565e5aab2fa21a04cd9a9af24663053d5fbe0",
    "date": "2026-11-25"
  },
  "/students": {
    "layout": "StudentsPage",
    "sha256": "8a2bf28ae27eeadbeedbbad6d78bc28cbf01a1ded2f726bc8b9f633f08ff1459",
    "date": "2026-11-25"
  },
  "/business": {
    "layout": "BusinessPage",
    "sha256": "9d05a4bda629795207fb5d6a3df4aa7422c59c392a6fba1df62b6d722c79bad3",
    "date": "2026-11-25"
  },
  "/tools": {
    "layout": "ToolsPage",
    "sha256": "c3753d219fc92f8182b14a98cf7ffea7d2629bb9a04814a2aacc6a63620d4645",
    "date": "2026-11-22"
  },
  "/offer": {
    "layout": "OfferPage",
    "sha256": "62a854d65b32a39a74b9fcb892f13a3ffe2fee3751dddfc45102b91b760901af",
    "date": "2026-10-08"
  },
  "/privacy": {
    "layout": "PrivacyPage",
    "sha256": "f370911ef253ae50011ec1ddcfb0508307240316b8329524c7058810ebb0efe1",
    "date": "2026-10-08"
  },
  "/consent": {
    "layout": "ConsentPage",
    "sha256": "26fa58b26f41534219cf4a80c113bce037c519e6d404eb351791eb695cc68939",
    "date": "2026-10-08"
  }
};
