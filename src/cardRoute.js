import { parseCards } from './cardImage.js';
import { svgToPng } from './cardPng.js';
import { cachedPng } from './cardCache.js';

export const cardPng = (store, kind, cards) => cachedPng(store, kind, cards, svgToPng);

// GET /mp/<board|hidden|hand>/<cards>.png. The cards are in the address, so the same address
// always gives the same picture.
export async function cardImageResponse(request, store) {
  const { kind, file } = request.params;
  const cards = parseCards(file.replace(/\.png$/, ''));
  const png = cards && (await cardPng(store, kind, cards));
  if (!png) return new Response('Not Found.', { status: 404 });
  return new Response(png, { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400, immutable' } });
}
