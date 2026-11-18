import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SQUARES, deal, evaluate, compareHands, handName, handFor, allPicks, bestHand, countBeaten, parseAnswer,
} from '../src/pokerRules.js';

const RANK = { 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, 10: 10, J: 11, Q: 12, K: 13, A: 14 };
const card = (s) => ({ rank: RANK[s.slice(0, -1)], suit: s.slice(-1) });
const cards = (s) => s.split(' ').map(card);
const hand = (s) => evaluate(cards(s));

function seeded(seed) {
  let x = seed;
  return () => {
    x = (x * 1664525 + 1013904223) % 4294967296;
    return x / 4294967296;
  };
}

test('every hand category evaluates with the right tie-break ranks', () => {
  assert.deepEqual(hand('9H 8H 7H 6H 5H'), { category: 8, ranks: [9] });
  assert.deepEqual(hand('9S 9H 9D 9C 2H'), { category: 7, ranks: [9, 2] });
  assert.deepEqual(hand('KS KH KD 4C 4S'), { category: 6, ranks: [13, 4] });
  assert.deepEqual(hand('AH 9H 7H 4H 2H'), { category: 5, ranks: [14, 9, 7, 4, 2] });
  assert.deepEqual(hand('9S 8H 7D 6C 5H'), { category: 4, ranks: [9] });
  assert.deepEqual(hand('7S 7H 7D KC 2H'), { category: 3, ranks: [7, 13, 2] });
  assert.deepEqual(hand('QS QH 4D 4C 9H'), { category: 2, ranks: [12, 4, 9] });
  assert.deepEqual(hand('10S 10H AD 7C 3H'), { category: 1, ranks: [10, 14, 7, 3] });
  assert.deepEqual(hand('AS 10H 7D 4C 2S'), { category: 0, ranks: [14, 10, 7, 4, 2] });
});

test('ace plays low in the wheel and high at the top, but never wraps around', () => {
  assert.deepEqual(hand('AS 2H 3D 4C 5S'), { category: 4, ranks: [5] });
  assert.deepEqual(hand('AS KH QD JC 10S'), { category: 4, ranks: [14] });
  assert.equal(hand('QS KH AD 2C 3S').category, 0);
  assert.deepEqual(hand('AH 2H 3H 4H 5H'), { category: 8, ranks: [5] });
});

test('hands compare by category, then by tie-break ranks', () => {
  assert.equal(compareHands(hand('9S 9H 9D 9C 2H'), hand('KS KH KD 4C 4S')), 1);
  assert.equal(compareHands(hand('AH 9H 7H 4H 2H'), hand('9S 8H 7D 6C 5H')), 1);
  assert.equal(compareHands(hand('AS KH QD JC 10S'), hand('KS QH JD 10C 9S')), 1);
  assert.equal(compareHands(hand('AS 2H 3D 4C 5S'), hand('2S 3H 4D 5C 6S')), -1);
  assert.equal(compareHands(hand('10S 10H AD 7C 3H'), hand('KS KH 4D 7C 3H')), -1);
  assert.equal(compareHands(hand('10S 10H AD 7C 3H'), hand('10D 10C AH 7S 2H')), 1);
});

test('suits never break a tie', () => {
  assert.equal(compareHands(hand('9S 8H 7D 6C 5H'), hand('9H 8D 7C 6S 5D')), 0);
});

test('handName gives the category name', () => {
  assert.equal(handName(hand('AS 10H 7D 4C 2S')), 'High card');
  assert.equal(handName(hand('10S 10H AD 7C 3H')), 'Pair');
  assert.equal(handName(hand('QS QH 4D 4C 9H')), 'Two pair');
  assert.equal(handName(hand('7S 7H 7D KC 2H')), 'Three of a kind');
  assert.equal(handName(hand('9S 8H 7D 6C 5H')), 'Straight');
  assert.equal(handName(hand('AH 9H 7H 4H 2H')), 'Flush');
  assert.equal(handName(hand('KS KH KD 4C 4S')), 'Full house');
  assert.equal(handName(hand('9S 9H 9D 9C 2H')), 'Four of a kind');
  assert.equal(handName(hand('9H 8H 7H 6H 5H')), 'Straight flush');
});

test('deal gives 16 board cards and 3 shared cards, all distinct', () => {
  const d = deal(seeded(7));
  assert.equal(d.board.length, 16);
  assert.equal(d.shared.length, 3);
  const keys = [...d.board, ...d.shared].map((c) => `${c.rank}${c.suit}`);
  assert.equal(new Set(keys).size, 19);
  assert.ok([...d.board, ...d.shared].every((c) => c.rank >= 2 && c.rank <= 14 && 'SHDC'.includes(c.suit)));
});

test('deal depends on the rng and survives its extreme values', () => {
  assert.notDeepEqual(deal(seeded(1)), deal(seeded(2)));
  assert.deepEqual(deal(seeded(5)), deal(seeded(5)));
  for (const v of [0, 0.999999999]) {
    const d = deal(() => v);
    assert.equal(new Set([...d.board, ...d.shared].map((c) => `${c.rank}${c.suit}`)).size, 19);
  }
});

// A board where the best pick is known: the two kings not on the table make four of a kind.
const KNOWN = {
  board: cards('4S 4H KH KC 2D 3D 5H 9C JD QC 7S 8H 10C 6D 2S 3C'),
  shared: cards('KS KD 2H'),
};

test('allPicks lists all 120 pairs of squares', () => {
  const picks = allPicks(KNOWN);
  assert.equal(picks.length, 120);
  assert.equal(new Set(picks.map((p) => p.picks.join())).size, 120);
  assert.ok(picks.every((p) => p.picks[0] < p.picks[1]));
});

test('handFor builds the hand from two squares plus the shared cards', () => {
  assert.deepEqual(handFor(KNOWN, [2, 3]), { category: 7, ranks: [13, 2] });
  assert.deepEqual(handFor(KNOWN, [0, 1]), { category: 2, ranks: [13, 4, 2] });
});

test('bestHand finds the strongest pick and countBeaten ranks a hand among the 120', () => {
  const best = bestHand(KNOWN);
  assert.deepEqual(best.picks, [2, 3]);
  assert.deepEqual(best.hand, { category: 7, ranks: [13, 2] });
  assert.equal(countBeaten(KNOWN, best.hand), 119);
  const weakest = allPicks(KNOWN).reduce((w, p) => (compareHands(p.hand, w.hand) < 0 ? p : w));
  assert.equal(countBeaten(KNOWN, weakest.hand), 0);
  const mid = handFor(KNOWN, [0, 1]);
  const brute = allPicks(KNOWN).filter((p) => compareHands(p.hand, mid) < 0).length;
  assert.equal(countBeaten(KNOWN, mid), brute);
});

test('parseAnswer takes two different squares in any case with common separators', () => {
  assert.equal(SQUARES, 'ABCDEFGHIJKLMNOP');
  for (const text of ['c j', 'CJ', 'C, J', ' c-j ', 'C & J', 'c/j']) {
    assert.deepEqual(parseAnswer(text), { ok: true, picks: [2, 9] }, text);
  }
  assert.deepEqual(parseAnswer('P A'), { ok: true, picks: [15, 0] });
});

test('parseAnswer rejects repeats, wrong counts, letters past P, and other text', () => {
  for (const text of ['C C', 'C', 'C J K', 'Q J', '', '  ', 'C and J', '12', 'CJ!', 'cc']) {
    assert.deepEqual(parseAnswer(text), { ok: false }, JSON.stringify(text));
  }
});
