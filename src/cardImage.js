// Pure SVG drawings of playing cards for Memory Poker. A renderer turns them into PNGs.
import { SQUARES } from './pokerRules.js';

const SUIT_SYMBOL = { S: '♠', H: '♥', D: '♦', C: '♣' };
const RANK_LABEL = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
const RED = '#d62f3a';
const BLACK = '#1c1f26';

export const CARD_W = 100;
export const CARD_H = 140;
const GAP = 14;
const PAD = 22;
const SECTION_GAP = 34;

const rankOf = (card) => RANK_LABEL[card.rank] ?? String(card.rank);

function faceSvg(card, x, y) {
  const color = card.suit === 'H' || card.suit === 'D' ? RED : BLACK;
  const suit = SUIT_SYMBOL[card.suit];
  return [
    `<g transform="translate(${x} ${y})" font-family="DejaVu Sans" font-weight="bold" fill="${color}">`,
    `<rect width="${CARD_W}" height="${CARD_H}" rx="10" fill="#fdfdfb" stroke="#b9bcc4" stroke-width="2"/>`,
    `<text x="10" y="32" font-size="30">${rankOf(card)}</text>`,
    `<text x="10" y="58" font-size="24">${suit}</text>`,
    `<text x="${CARD_W / 2 + 8}" y="${CARD_H / 2 + 28}" font-size="64" text-anchor="middle">${suit}</text>`,
    '</g>',
  ].join('');
}

// A face-down card, marked with the letter of its square.
function backSvg(letter, x, y) {
  return [
    `<g transform="translate(${x} ${y})" font-family="DejaVu Sans" font-weight="bold">`,
    `<rect width="${CARD_W}" height="${CARD_H}" rx="10" fill="#2b3f6b" stroke="#b9bcc4" stroke-width="2"/>`,
    `<rect x="8" y="8" width="${CARD_W - 16}" height="${CARD_H - 16}" rx="6" fill="none" stroke="#8fa3cf" stroke-width="2"/>`,
    `<text x="${CARD_W / 2}" y="${CARD_H / 2 + 20}" font-size="60" text-anchor="middle" fill="#ffffff">${letter}</text>`,
    '</g>',
  ].join('');
}

// Rows of cards. A card is { rank, suit } for a face, or { back: 'A' } for a face-down card.
// A row can set `gapAfter` (a wider space after that many cards) or `spaceBefore` (a wider
// space above the row).
export function cardsSvg(rows) {
  const widths = rows.map((r) => r.cards.length * CARD_W + (r.cards.length - 1) * GAP + (r.gapAfter ? SECTION_GAP - GAP : 0));
  const width = Math.max(...widths) + PAD * 2;
  let y = PAD;
  const body = rows.map((row, r) => {
    if (row.spaceBefore) y += SECTION_GAP - GAP;
    const x0 = (width - widths[r]) / 2;
    const top = y;
    y += CARD_H + GAP;
    return row.cards.map((card, i) => {
      const x = x0 + i * (CARD_W + GAP) + (row.gapAfter && i >= row.gapAfter ? SECTION_GAP - GAP : 0);
      return card.back ? backSvg(card.back, x, top) : faceSvg(card, x, top);
    }).join('');
  });
  const height = y - GAP + PAD;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" rx="18" fill="#1f6b43"/>${body.join('')}</svg>`;
}

const rowsOf = (cards, size) => Array.from({ length: cards.length / size }, (_, r) => ({ cards: cards.slice(r * size, r * size + size) }));

// The 16 cards face up in a 4x4 grid, with no letters: players memorize positions.
export const boardSvg = (board) => cardsSvg(rowsOf(board, 4));

// After the flash: 16 face-down cards lettered A to P, with the three shared cards below.
export const hiddenSvg = (shared) =>
  cardsSvg([...rowsOf([...SQUARES].map((back) => ({ back })), 4), { cards: shared, spaceBefore: true }]);

// A player's hand: their two picked cards, a gap, then the three shared cards.
export const handSvg = (picked, shared) => cardsSvg([{ cards: [...picked, ...shared], gapAfter: picked.length }]);

// ── Stateless image addresses: the cards are in the URL, so nothing needs storing ──

const RANK_CHARS = { 10: 'T', ...RANK_LABEL };
const CHAR_RANKS = { T: 10, J: 11, Q: 12, K: 13, A: 14 };

export const cardCode = (card) => `${RANK_CHARS[card.rank] ?? card.rank}${card.suit}`;

export function parseCards(codes) {
  if (!codes || !/^([2-9TJQKA][SHDC])+$/.test(codes)) return null;
  return codes.match(/../g).map((c) => ({ rank: CHAR_RANKS[c[0]] ?? Number(c[0]), suit: c[1] }));
}

export const imageUrl = (origin, kind, cards) => `${origin}/mp/${kind}/${cards.map(cardCode).join('')}.png`;

const COUNTS = { board: 16, hidden: 3, hand: 5 };

export function svgFor(kind, cards) {
  if (cards.length !== COUNTS[kind] || new Set(cards.map(cardCode)).size !== cards.length) return null;
  if (kind === 'board') return boardSvg(cards);
  if (kind === 'hidden') return hiddenSvg(cards);
  return handSvg(cards.slice(0, 2), cards.slice(2));
}
