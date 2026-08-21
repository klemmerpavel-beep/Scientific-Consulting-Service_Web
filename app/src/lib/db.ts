import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

/**
 * Один экземпляр клиента на процесс. В режиме разработки Next перезагружает
 * модули на каждое изменение — без глобального кэша это оставляло бы
 * висящие подключения к базе.
 *
 * Адрес базы приходит из окружения. Требование ч. 5 ст. 18 152-ФЗ: база
 * находится на территории России — это обеспечивается выбором площадки,
 * см. docs/DECISIONS.md, Р-06.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function build(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL не задан. Приём заявок без базы невозможен: не будет ни заявки, ни журнала согласий.',
    );
  }
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
}

export const prisma: PrismaClient = globalForPrisma.prisma ?? build();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
