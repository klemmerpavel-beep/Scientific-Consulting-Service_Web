# Директ: загрузка кампаний, доступ к API, выбор аккаунта

Исследование 12.10.2026 для `../launch/03-заявка-api-директа.md`,
`../launch/05-аккаунт-и-загрузка-директа.md` и каркаса `../mcp/server/`.

**Как проверялось.** Страницы yandex.ru, elama.ru и click.ru из среды
напрямую не открываются; каждый факт проверен через поисковую выдачу с
выдержками официальных страниц. Где выдержки расходятся или их нет —
«не подтверждено». Шаблон Excel перед загрузкой сверяется в интерфейсе.

## 1. Главное для запуска

1. **С 30.06.2026 текстово-графические объявления в ЕПК не создаются**,
   с 14.07.2026 они переведены в комбинаторные. В комбинаторном
   объявлении до 7 заголовков по 56 знаков и до 3 текстов по 81;
   дополнительного заголовка на 30 знаков нет; не больше 3 неархивных
   комбинаторных объявлений в группе [1][2][3][4]. Кампании проекта
   переведены на этот формат (Р-569).
2. **Заголовки быстрых ссылок 1–4 вместе — не больше 66 знаков** (и
   отдельно 5–8). Если хотя бы одна ссылка не проходит, не уходит весь
   набор [5]. Было 78 и 85 знаков — сокращены до 64 и 65.
3. **Стратегия из файла не переносится:** при создании кампании из XLS
   или XLSX она получает «Максимум кликов» без ограничения бюджета на всех
   площадках [6][7]. Коммандер тоже не сохраняет настройки кампании [8].
   Поэтому кампанию создают вручную, а группы и объявления — загрузкой.
4. **Свой аккаунт Директа на ООО** — без платы сервиса, документы от
   Яндекса по ЭДО, маркировка автоматическая, доступ к API без
   посредника (раздел 5).

## 2. Загрузка из файла

**Веб-интерфейс** — «Инструменты» — «Управление с помощью Excel» [6].

- ЕПК поддерживается для файлов с комбинаторными, текстово-графическими
  и графическими объявлениями [6][9].
- XLS или XLSX до 60 000 строк; названия столбцов — как в шаблоне, иначе
  ошибка [6][10].
- Режимы: «Создать новую кампанию», «Изменить кампанию» (по «Номеру
  заказа»), «Добавить в существующую». С ошибкой в файле не загружается
  ничего; кампания блокируется на 5 минут [6].
- Вкладки шаблона: «Тексты», «Контактная информация», «Регионы»,
  «Словарь значений полей» [11].
- Быстрые ссылки и уточнения после правок через файл переносятся на
  уровень объявления [6][12].

**Подтверждённые столбцы листа «Тексты»** [6]: «Доп. объявление группы»
(«-» у главного), «Тип кампании» и «Тип объявления» (только при создании),
«ID группы», «Название группы», «Номер группы», «Фраза (с минус-словами)»
(только у главного объявления), «Минус-фразы на группу» (через запятую, до
4096), «Минус-фразы на кампанию» (до 20 000), «Ссылка», «Отображаемая
ссылка» (до 20), «Регион», «Ставка», «Метки» (метки объявлений, не UTM:
UTM — в поле «Ссылка»), «Заголовки быстрых ссылок», «Описания быстрых
ссылок», «Адреса быстрых ссылок», «Уточнения» (разделитель «||»).

Не подтверждено: точные названия столбцов заголовков и текстов
комбинаторного объявления («Заголовок 1…7», «Текст 1…3»); раскладка шапки
шаблона.

**Директ Коммандер** [8][13]: импорт из XLSX, XLS, CSV, TXT и буфера; CSV
и TXT — UTF-8, разделитель табуляция, несколько кампаний в файле, названия
столбцов по-русски, порядок не важен. ЕПК — комбинаторные, текстово-
графические и графические объявления; новые «Текст и изображение»
создаются комбинаторными [8][14]. Режим «исходная кампания» удаляет
объекты, которых нет в файле, — для проекта не использовать.

## 3. Доступ к API

Порядок [15][16]:

1. Приложение в Яндекс ID — тип «Для доступа к API или отладки», право
   `direct:api`; выдаются ClientID и Client secret. У таких приложений
   нельзя менять redirect_uri; токен — через
   `https://oauth.yandex.ru/verification_code` [17].
2. Вход под логином аккаунта Директа, где есть хотя бы одна кампания,
   созданная в веб-интерфейсе.
3. «Настройки API»: принять соглашение — «Мои заявки» — «Новая заявка»:
   ClientID, рабочая почта, полное описание приложения.
4. Сначала тестовый доступ — Песочница; затем заявка переводится в полную
   на вкладке «Мои заявки». Обязателен раздел «Технические сведения о
   приложении»: какие сервисы и методы, порядок и частота вызовов и
   почему такая, как учитываются ограничения и обрабатываются ошибки; код
   не прикладывается [18].
5. Рассмотрение — рабочие дни 10:00–19:00 по Москве, от часа до 3 рабочих
   дней, в пик до 7 [19]. Причина отказа — в «Моих заявках», правленая
   заявка уходит повторно [20].

Метрика: право `metrika:read` — «получение статистики, чтение параметров
своих и доверенных счётчиков» [21]. Можно ли совмещать `direct:api` и
`metrika:read` в одном приложении — не подтверждено; проект делает два
приложения (спецификация MCP: отдельный токен Метрики только на чтение).

## 4. API для каркаса MCP

- Отчёты: `https://api.direct.yandex.com/json/v501/reports` по действующей
  документации; в старых примерах — `v5` [22]. Заголовки: `Authorization:
  Bearer`, `Client-Login` — только для агентства, `processingMode`
  (по умолчанию auto), `returnMoneyInMicros` (`false` — рубли с двумя
  знаками), `skipReportHeader`, `skipColumnHeader`, `skipReportSummary`
  [23][24].
- Коды: 200 — готов, 201 — в очереди, 202 — формируется, повтор через
  `retryIn`; не больше 20 запросов за 10 секунд, в офлайн-очереди до 5
  отчётов, готовые хранятся 5 часов [25][26]. Отчёт по поисковым запросам
  — только офлайн [26].
- ReportDefinition: ReportName (уникальное), ReportType, DateRangeType,
  Format (только TSV), IncludeVAT; DateFrom и DateTo — только при
  CUSTOM_DATE; Goals до 10; AttributionModels — FCCD, LC, LSCCD, AUTO, по
  умолчанию LC [27]. Каркас использует LSCCD.
- Поля Impressions, Clicks, Ctr, Cost, AvgCpc, Conversions — во всех
  отчётах; Query — только в отчёте по поисковым запросам; Criterion и
  CriterionType не смешиваются с Criteria и CriteriaType [28][29][30].
- Campaigns.get для ЕПК — `json/v501/campaigns`; UnifiedCampaignFieldNames
  — CounterIds, Settings, BiddingStrategy, PriorityGoals, TrackingParams и
  др.; SelectionCriteria — Ids, Types, States, Statuses [31][32][33].
  Ставки и цены — в микроединицах.
- Метрика: `https://api-metrika.yandex.net/stat/v1/data`, токен только в
  заголовке `Authorization: OAuth`, accuracy `full` [34][35][36]. С 20.05.2026
  отключены «Первый переход», «Последний значимый переход» и обе модели
  «Последний переход из Директа» [37][38]. Каркас использует `last`;
  проверить на первом живом запросе.

Не подтверждено: отключён ли адрес `json/v5/reports`; в микроединицах ли
DailyBudget в ответе Campaigns.get.

## 5. Свой аккаунт или агентский сервис

| | Свой аккаунт на ООО | eLama | Click.ru |
|---|---|---|---|
| Минимальный платёж | 1 000 ₽ без НДС (1 220 ₽ с НДС 22 %) [39][40][41] | 1 200 ₽ [42] | 1 200 ₽ с НДС [43] |
| Плата сервиса | нет | Basic бесплатно; Optimal 950 ₽ в месяц; 2,7–4 % при оплате картой или СБП; сбор до 6 000 ₽ в месяц с неактивных кабинетов [44][45] | позиционируется «без комиссии» |
| Маркировка | Яндекс как ОРД; «Данные рекламодателя»: вид организации, название, ИНН, ОКВЭД; «Я конечный рекламодатель» не снимать [46][47] | подаёт eLama, рекламодатель указывает ИНН [48] | данные передаёт в ОРД Яндекса [47] |
| Документы | акт и счёт-фактура от Яндекса до 7 рабочих дней следующего месяца; ЭДО Диадок и СБИС [49] | от ООО «СМБ-Сервис», ЭДО Диадок или СБИС [50][51] | формируются автоматически [47] |
| API | своё приложение и заявка, без Client-Login | у аккаунтов e-XXXXXXX — свой токен; у porg- — через поддержку [52] | своё приложение, заявка через интерфейс Директа [53] |
| Возврат остатка | письмо за подписями руководителя и главбуха, может занять больше 20 рабочих дней [54] | по заявлению, срок не указан [55] | не подтверждено |

Агентская модель в API: агентство работает своим токеном с Client-Login
клиента; доступ к API одобряет Яндекс [56]. Из агентского аккаунта можно
отсоединиться без остановки кампаний и с сохранением статистики [57].

**Рекомендация — свой аккаунт.** При 16 400 ₽ на четыре недели кешбэк
агентств незначителен, а посредник добавляется в документы, возврат и
для части аккаунтов — в доступ к API, который нужен MCP-серверу.

## 6. Пределы объявления

- Заголовок — 56 знаков с пробелами и знаками препинания, слово до 22 [58].
- Текст — 81 знак и до 15 знаков препинания сверх них (точки, запятые,
  кавычки, двоеточия, точки с запятой, восклицательные знаки), слово до
  23 [58][59].
- Быстрые ссылки — до 8, заголовок до 30, описание до 60, заголовки 1–4 и
  5–8 — до 66 каждые; нельзя «! ? [ ]» и эмодзи [5].
- Уточнения — до 25 знаков каждое; в сумме до 132 на компьютере и 76 на
  телефоне [12].
- Отображаемая ссылка — до 20 знаков; буквы, цифры, «- № / % #» [60].
- Фраза — до 7 слов, до 4096 знаков с минус-словами, до 200 фраз в группе
  [61]. Минус-фразы кампании — до 20 000 знаков без пробелов, группы — до
  4096; в минус-фразе до 7 слов.

## Источники

1. https://yandex.ru/adv/news/obnovlenie-tekstovo-graficheskih-obyavleniy-do-kombinatornyh-protsess-i-osobennosti
2. https://yandex.com/dev/direct/doc/ru/update-tga
3. https://yandex.ru/support/direct/ru/unified-performance-campaign/upgrade-to-comb
4. https://yandex.ru/support/direct/en/unified-performance-campaign/create-comb-ad
5. https://yandex.ru/support/direct/en/efficiency/quick-links
6. https://yandex.ru/support/direct/en/alternative-interfaces/xls-interface
7. https://yandex.ru/adv/edu/materials/kak-skopirovat-kampaniyu-v-direct
8. https://yandex.ru/support/direct-commander-new/en/advanced/export
9. https://yard.yandex.ru/courses/direct-prodvinutyy/excel-shablon-kampanij
10. https://yandex.ru/support/direct/en/alternative-interfaces/xls-interface-errors
11. https://yard.yandex.ru/courses/direct-prodvinutyy/excel
12. https://yandex.ru/support/direct/en/efficiency/callout
13. https://yandex.ru/support/direct-commander-new/en/advanced/file-format
14. https://yandex.ru/support/direct-commander-new/en/advanced/import
15. https://yandex.ru/dev/direct/doc/en/concepts/register
16. https://yandex.ru/dev/direct/doc/ru/best-practice/quick-start.html
17. https://yandex.com/dev/id/doc/ru/register-api
18. https://yandex.ru/dev/direct/doc/en/real-world
19. https://yandex.com/dev/direct/doc/start/access-request.html
20. https://yandex.ru/dev/direct/doc/en/troubleshooting/register
21. https://yandex.com/dev/metrika/en/intro/authorization
22. https://yandex.ru/dev/direct/doc/en/reports
23. https://yandex.ru/dev/direct/doc/en/headers
24. https://yandex.ru/dev/direct/doc/en/money
25. https://yandex.ru/dev/direct/doc/en/codes
26. https://yandex.ru/dev/direct/doc/en/mode
27. https://yandex.ru/dev/direct/doc/en/spec
28. https://yandex.ru/dev/direct/doc/en/fields-list
29. https://yandex.ru/dev/direct/doc/en/report-format
30. https://yandex.ru/dev/direct/doc/en/compatibility
31. https://yandex.com/dev/direct/doc/en/campaigns/campaigns
32. https://yandex.com/dev/direct/doc/en/campaigns/get-unified-campaign
33. https://yandex.ru/dev/direct/doc/en/campaigns/get
34. https://yandex.com/dev/metrika/en/stat/openapi/data
35. https://yandex.com/dev/metrika/en/stat/sampling
36. https://yandex.com/dev/metrika/en/stat/attrandmetr/dim_all
37. https://yandex.ru/support/metrica/ru/reports/attribution-model
38. https://yandex.ru/adv/news/ustarevshie-modeli-atribycii
39. https://yandex.ru/support/direct/ru/payments/min-payment
40. https://b2b.yandex.ru/adv/news/22-marta-v-direkte-izmenitsya-minimalnyy-platezh
41. https://yandex.com/support/direct/ru/payments/faq.html?lang=ru
42. https://help.elama.ru/article/45356
43. https://help.click.ru/6353
44. https://help.elama.ru/article/45324
45. https://help.elama.ru/article/45471
46. https://yandex.ru/support/direct/en/technologies-and-services/ad-labelingl
47. https://blog.click.ru/markirovka-reklamy/markirovka-reklamy-v-yandeks-direkte/
48. https://help.elama.ru/article/57651
49. https://yandex.ru/support/balance/ru/services/b-direct/docs.html
50. https://help.elama.ru/article/45178
51. https://help.elama.ru/article/45365
52. https://help.elama.ru/article/82321
53. https://blog.click.ru/direct-yandex/kak-uprostit-rabotu-v-direkte/
54. https://yandex.ru/support/direct/en/payments/refund
55. https://help.elama.ru/article/45170
56. https://yandex.ru/dev/direct/doc/en/best-practice/agency
57. https://yandex.ru/support/direct/ru/agencies/account-transfer
58. https://yandex.ru/support/direct/en/moderation/technical-restrictions
59. https://yandex.ru/support/direct/en/efficiency/text-and-title
60. https://yandex.ru/support/direct/en/efficiency/display-link
61. https://yandex.ru/support/direct/ru/keywords/keywords
