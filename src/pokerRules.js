// Cards and poker hands for Memory Poker. Pure, so it runs in plain node.
export const SQUARES = 'ABCDEFGHIJKLMNOP';
const SUITS = ['S', 'H', 'D', 'C'];
const CATEGORY_NAMES = [
  'High card', 'Pair', 'Two pair', 'Three of a kind', 'Straight', 'Flush', 'Full house', 'Four of a kind', 'Straight flush',
];

const fullDeck = () => SUITS.flatMap((suit) => Array.from({ length: 13 }, (_, i) => ({ rank: i + 2, suit })));

// `rng()` returns [0, 1). The first 19 cards of a partial shuffle are the board (16) and shared cards (3).
export function deal(rng) {
  const deck = fullDeck();
  for (let i = 0; i < 19; i++) {
    const j = i + Math.min(deck.length - i - 1, Math.floor(rng() * (deck.length - i)));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return { board: deck.slice(0, 16), shared: deck.slice(16, 19) };
}

// Top card of a straight, or 0. `ranks` is five ranks, high to low.
function straightTop(ranks) {
  if (new Set(ranks).size !== 5) return 0;
  if (ranks[0] - ranks[4] === 4) return ranks[0];
  return ranks.join() === '14,5,4,3,2' ? 5 : 0;
}

export function evaluate(cards) {
  const ranks = cards.map((c) => c.rank).sort((a, b) => b - a);
  const flush = cards.every((c) => c.suit === cards[0].suit);
  const counts = new Map();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);
  // Most repeated first, then highest: this order is also the tie-break order.
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const top = straightTop(ranks);
  const [first, second] = groups.map((g) => g[1]);

  if (top && flush) return { category: 8, ranks: [top] };
  if (first === 4) return { category: 7, ranks: groups.map((g) => g[0]) };
  if (first === 3 && second === 2) return { category: 6, ranks: groups.map((g) => g[0]) };
  if (flush) return { category: 5, ranks };
  if (top) return { category: 4, ranks: [top] };
  if (first === 3) return { category: 3, ranks: groups.map((g) => g[0]) };
  if (first === 2 && second === 2) return { category: 2, ranks: groups.map((g) => g[0]) };
  if (first === 2) return { category: 1, ranks: groups.map((g) => g[0]) };
  return { category: 0, ranks };
}

export function compareHands(a, b) {
  if (a.category !== b.category) return a.category > b.category ? 1 : -1;
  for (let i = 0; i < a.ranks.length; i++) {
    if (a.ranks[i] !== b.ranks[i]) return a.ranks[i] > b.ranks[i] ? 1 : -1;
  }
  return 0;
}

export const handName = (hand) => CATEGORY_NAMES[hand.category];

export const handFor = (d, [i, j]) => evaluate([d.board[i], d.board[j], ...d.shared]);

export function allPicks(d) {
  const picks = [];
  for (let i = 0; i < 16; i++) {
    for (let j = i + 1; j < 16; j++) picks.push({ picks: [i, j], hand: handFor(d, [i, j]) });
  }
  return picks;
}

// Several picks can tie for best; the first by square order is reported.
export const bestHand = (d) =>
  allPicks(d).reduce((best, p) => (compareHands(p.hand, best.hand) > 0 ? p : best));

export const countBeaten = (d, hand) => allPicks(d).filter((p) => compareHands(p.hand, hand) < 0).length;

export function parseAnswer(text) {
  const s = String(text).trim().toUpperCase();
  if (!/^[A-P][\s,;&+/-]*[A-P]$/.test(s)) return { ok: false };
  const [a, b] = s.match(/[A-P]/g);
  if (a === b) return { ok: false };
  return { ok: true, picks: [SQUARES.indexOf(a), SQUARES.indexOf(b)] };
}
