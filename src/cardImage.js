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

function cardSvg(card, x, y, label) {
  const color = card.suit === 'H' || card.suit === 'D' ? RED : BLACK;
  const suit = SUIT_SYMBOL[card.suit];
  const rank = rankOf(card);
  return [
    `<g transform="translate(${x} ${y})" font-family="DejaVu Sans" font-weight="bold" fill="${color}">`,
    `<rect width="${CARD_W}" height="${CARD_H}" rx="10" fill="#fdfdfb" stroke="#b9bcc4" stroke-width="2"/>`,
    `<text x="10" y="32" font-size="30">${rank}</text>`,
    `<text x="10" y="58" font-size="24">${suit}</text>`,
    `<text x="${CARD_W / 2 + 8}" y="${CARD_H / 2 + 28}" font-size="64" text-anchor="middle">${suit}</text>`,
    ...(label
      ? [
          `<circle cx="${CARD_W - 18}" cy="${CARD_H - 18}" r="13" fill="#2b3f6b"/>`,
          `<text x="${CARD_W - 18}" y="${CARD_H - 11}" font-size="19" text-anchor="middle" fill="#ffffff">${label}</text>`,
        ]
      : []),
    '</g>',
  ].join('');
}

// Cards laid out in rows. Each row is { cards, labels?, gapAfter? }: `labels` are the square
// letters for the cards, `gapAfter` leaves a wider space after that many cards.
export function cardsSvg(rows) {
  const widths = rows.map((r) => r.cards.length * CARD_W + (r.cards.length - 1) * GAP + (r.gapAfter ? SECTION_GAP - GAP : 0));
  const width = Math.max(...widths) + PAD * 2;
  const height = rows.length * CARD_H + (rows.length - 1) * GAP + PAD * 2;
  const body = rows.map((row, r) => {
    const x0 = (width - widths[r]) / 2;
    return row.cards.map((card, i) => {
      const extra = row.gapAfter && i >= row.gapAfter ? SECTION_GAP - GAP : 0;
      return cardSvg(card, x0 + i * (CARD_W + GAP) + extra, PAD + r * (CARD_H + GAP), row.labels?.[i]);
    }).join('');
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" rx="18" fill="#1f6b43"/>${body.join('')}</svg>`;
}

// The 16-card board in a 4x4 grid, each card tagged with its square letter.
export const boardSvg = (board) =>
  cardsSvg([0, 1, 2, 3].map((r) => ({
    cards: board.slice(r * 4, r * 4 + 4),
    labels: [...SQUARES.slice(r * 4, r * 4 + 4)],
  })));

export const sharedSvg = (shared) => cardsSvg([{ cards: shared }]);

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

const COUNTS = { board: 16, shared: 3, hand: 5 };

export function svgFor(kind, cards) {
  if (cards.length !== COUNTS[kind] || new Set(cards.map(cardCode)).size !== cards.length) return null;
  if (kind === 'board') return boardSvg(cards);
  if (kind === 'shared') return sharedSvg(cards);
  return handSvg(cards.slice(0, 2), cards.slice(2));
}
