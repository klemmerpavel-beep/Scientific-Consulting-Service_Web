/**
 * Наполнение справочников кабинета.
 *
 * В отличие от `seed-cabinet.ts`, этот скрипт предназначен и для боевой
 * базы: справочник типов сопровождения и таблица заливок — не выдуманные
 * данные стенда, а рабочая номенклатура практики. Скрипт идемпотентен:
 * повторный запуск не плодит записей и не затирает правок, внесённых
 * руководителем через кабинет, кроме наименования и порядка вывода.
 *
 * Состав справочника: шесть позиций, покрывающих все тридцать написаний
 * книги заказов (решение Р-125). Базовые цены не заводятся — прайс не
 * утверждён, а поле, заполненное догадкой, хуже пустого.
 *
 * Запуск: npm run seed:reference
 */

import { prisma } from '../src/lib/db.ts';

/** Коды совпадают с кодами свода `classifyType`: справочник и разбор обязаны сходиться. */
const SERVICE_TYPES: readonly {
  code: string;
  name: string;
  sortOrder: number;
  aliases: readonly string[];
}[] = [
  {
    code: 'dissertation',
    name: 'Сопровождение диссертационного исследования',
    sortOrder: 10,
    aliases: ['диссертация', 'кандидатская диссертация', 'докторская диссертация'],
  },
  {
    code: 'postgrad',
    name: 'Сопровождение поступления и обучения в аспирантуре',
    sortOrder: 20,
    aliases: ['аспирантура', 'поступление в аспирантуру', 'пакет аспирантуры'],
  },
  {
    code: 'consulting',
    name: 'Научный консалтинг и сопровождение до защиты',
    sortOrder: 30,
    aliases: ['консультационное сопровождение', 'сопровождение до защиты', 'консалтинг'],
  },
  {
    code: 'research',
    name: 'НИР, НИОКР и отчётные материалы',
    sortOrder: 40,
    aliases: ['нир', 'ниокр', 'отчёт нир', 'презентация по отчёту нир'],
  },
  {
    code: 'article',
    name: 'Научные публикации и патентные материалы',
    sortOrder: 50,
    aliases: ['статья', 'статья вак', 'обзорная статья', 'патент'],
  },
  {
    code: 'diploma',
    name: 'Сопровождение выпускной квалификационной работы',
    sortOrder: 60,
    aliases: ['дипломная работа', 'специалитет', 'бакалавриат', 'магистратура'],
  },
];

/**
 * Заливка исходной книги. Значение — подсказка предпросмотру, а не решение:
 * состояние работы берётся по тексту статуса, а расхождение с цветом
 * выводится отдельным перечнем.
 */
const COLOR_MAP: readonly { argb: string; mapsTo: string; description: string }[] = [
  { argb: 'FF00B050', mapsTo: 'CLOSED', description: 'Зелёная: работа доведена' },
  { argb: 'FFFFFF00', mapsTo: 'IN_WORK', description: 'Жёлтая: работа идёт' },
  { argb: 'FF00B0F0', mapsTo: 'ON_START', description: 'Голубая: работа на старте' },
  { argb: 'FFFF0000', mapsTo: 'STOPPED', description: 'Красная: работа остановлена' },
];

function normalizeAlias(raw: string): string {
  return raw.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
}

async function main() {
  for (const type of SERVICE_TYPES) {
    const record = await prisma.serviceType.upsert({
      where: { code: type.code },
      create: { code: type.code, name: type.name, sortOrder: type.sortOrder },
      update: { name: type.name, sortOrder: type.sortOrder },
    });

    for (const alias of type.aliases) {
      const normalized = normalizeAlias(alias);
      // Привязка псевдонима не переписывается: руководитель мог отнести его
      // к другой позиции вручную на экране импорта, и это решение старше.
      await prisma.serviceTypeAlias.upsert({
        where: { alias: normalized },
        create: { alias: normalized, serviceTypeId: record.id },
        update: {},
      });
    }
  }

  for (const color of COLOR_MAP) {
    await prisma.importColorMap.upsert({
      where: { argb: color.argb },
      create: color,
      update: { mapsTo: color.mapsTo, description: color.description },
    });
  }

  const types = await prisma.serviceType.count();
  const aliases = await prisma.serviceTypeAlias.count();
  console.log(`Справочник типов: ${types} позиций, ${aliases} написаний.`);
  console.log(`Таблица заливок: ${COLOR_MAP.length} цвета.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error: unknown) => {
    await prisma.$disconnect();
    console.error(error);
    process.exitCode = 1;
  });
