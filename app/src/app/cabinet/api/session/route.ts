import { NextResponse } from 'next/server';

import { currentActor } from '../../../../lib/cabinet/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Проверка сессии для обратного прокси (решение Р-247).
 *
 * Серверное действие разбирает тело запроса до того, как узнаёт, кто его
 * прислал: POST в 130 МБ от анонима занимал память приложения раньше
 * всякой проверки. nginx перед передачей крупного тела спрашивает этот
 * адрес подзапросом без тела и пропускает загрузку, только если сессия
 * жива. Ответ пустой: кто вошёл, прокси знать незачем.
 */
export async function GET(): Promise<NextResponse> {
  const actor = await currentActor();
  return new NextResponse(null, {
    status: actor === null ? 401 : 204,
    headers: { 'cache-control': 'no-store' },
  });
}
