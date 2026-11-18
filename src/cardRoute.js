import { parseCards, svgFor } from './cardImage.js';
import { svgToPng } from './cardPng.js';

// GET /mp/<board|shared|hand>/<cards>.png. The cards are in the address, so the same address
// always gives the same picture and the edge cache can keep it.
export async function cardImageResponse(request, ctx) {
  const { kind, file } = request.params;
  const cards = parseCards(file.replace(/\.png$/, ''));
  const svg = cards && svgFor(kind, cards);
  if (!svg) return new Response('Not Found.', { status: 404 });

  const key = new Request(request.url);
  const cached = await caches.default.match(key);
  if (cached) return cached;
  const response = new Response(await svgToPng(svg), {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400, immutable' },
  });
  ctx.waitUntil(caches.default.put(key, response.clone()));
  return response;
}
