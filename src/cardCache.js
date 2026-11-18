import { svgFor, cardCode } from './cardImage.js';

// The picture for these cards: read from storage if it was drawn before, else drawn and kept.
// Drawing takes most of a second, so the game draws the next pictures ahead of time.
export async function cachedPng(store, kind, cards, render) {
  const svg = svgFor(kind, cards);
  if (!svg) return null;
  const key = `${kind}/${cards.map(cardCode).join('')}`;
  const kept = await store.getImage(key);
  if (kept) return kept;
  const png = await render(svg);
  await store.saveImage(key, png);
  return png;
}

