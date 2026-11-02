import { siteUrl } from '../../lib/site-url';
import { robotsTxt } from './body';

export const dynamic = 'force-dynamic';

/** robots.txt сайта (Р-776): правила и `Clean-param` — в `body.ts`. */
export function GET(): Response {
  const body = robotsTxt({ demoStand: process.env.NEXT_PUBLIC_DEMO_STAND === '1', base: siteUrl() });
  return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
}
