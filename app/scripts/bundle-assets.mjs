/**
 * Докладывает в самодостаточную сборку то, что `next build` в неё не кладёт:
 * статику из `.next/static` и файлы из `public`.
 *
 * Без этого контейнер поднимается, отдаёт разметку и не отдаёт ни стилей,
 * ни скриптов, ни фотографий — страница выглядит сломанной, а в логах пусто.
 *
 * На Vercel самодостаточной сборки нет: платформа раскладывает приложение
 * по своим функциям сама. Тогда шаг просто ничего не делает.
 */
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';

const standalone = path.join('.next', 'standalone');

if (!existsSync(standalone)) {
  console.log('bundle:assets — самодостаточной сборки нет, шаг пропущен');
  process.exit(0);
}

for (const target of [path.join(standalone, 'public'), path.join(standalone, '.next', 'static')]) {
  rmSync(target, { recursive: true, force: true });
}

cpSync('public', path.join(standalone, 'public'), { recursive: true });
mkdirSync(path.join(standalone, '.next'), { recursive: true });
cpSync(path.join('.next', 'static'), path.join(standalone, '.next', 'static'), { recursive: true });

console.log('bundle:assets — public и .next/static доложены в сборку');
