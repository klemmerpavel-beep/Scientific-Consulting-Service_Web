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
    "sha256": "fb644989c93a01e6bf1b625945d62aa58249bc742eaa22f0189176f75916cdb3",
    "date": "2026-11-25"
  },
  "/business": {
    "layout": "BusinessPage",
    "sha256": "6e6b12cea35b7b01844b9c8a100932a3d7b9eb894c6b701ba583d44601237b3c",
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
