import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boardSvg, hiddenSvg, handSvg, cardCode, parseCards, imageUrl, svgFor } from '../src/cardImage.js';

const RANK = { 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, T: 10, J: 11, Q: 12, K: 13, A: 14 };
const card = (s) => ({ rank: RANK[s[0]], suit: s[1] });
const BOARD = '4S 4H KH KC 2D 3D 5H 9C JD QC 7S 8H TC 6D 2S 3C'.split(' ').map(card);
const SHARED = 'KS KD 2H'.split(' ').map(card);
const ORIGIN = 'https://okbot.example.dev';

test('cards encode to two characters and decode back, with ten as T', () => {
  assert.equal(cardCode({ rank: 10, suit: 'H' }), 'TH');
  assert.equal(cardCode({ rank: 14, suit: 'S' }), 'AS');
  assert.deepEqual(parseCards('TH2CKD'), [{ rank: 10, suit: 'H' }, { rank: 2, suit: 'C' }, { rank: 13, suit: 'D' }]);
});

test('parseCards rejects bad ranks, bad suits, odd lengths and lowercase', () => {
  for (const bad of ['1S', '5X', '5', '5S5', '5s', '']) assert.equal(parseCards(bad), null, bad);
});

test('image urls are stateless, so they carry the cards and nothing else', () => {
  assert.equal(imageUrl(ORIGIN, 'hidden', SHARED), `${ORIGIN}/mp/hidden/KSKD2H.png`);
});

test('the board is 16 face-up cards with no square letters, in both suit colors', () => {
  const svg = boardSvg(BOARD);
  assert.equal(svg.split('<g ').length - 1, 16);
  assert.doesNotMatch(svg, /font-size="60"/);
  assert.ok(svg.includes('#d62f3a') && svg.includes('#1c1f26'));
});

test('the hidden view is 16 lettered card backs plus the three shared cards face up', () => {
  const svg = hiddenSvg(SHARED);
  assert.equal(svg.split('<g ').length - 1, 19);
  for (const letter of 'ABCDEFGHIJKLMNOP') assert.ok(svg.includes(`>${letter}</text>`), letter);
  assert.ok(svg.includes('>K</text>') && svg.includes('>2</text>'));
});

test('the hidden view puts the shared cards on their own row below the grid', () => {
  const svg = hiddenSvg(SHARED);
  const ys = [...svg.matchAll(/translate\(([\d.]+) ([\d.]+)\)/g)].map((m) => Number(m[2]));
  assert.equal(new Set(ys).size, 5);
  assert.equal(ys.slice(-3).every((y) => y === ys.at(-1)), true);
  assert.ok(ys.at(-1) > ys.at(-4) + 140);
});

test('a hand drawing has five face-up cards and no letters', () => {
  const hand = handSvg([BOARD[2], BOARD[3]], SHARED);
  assert.equal(hand.split('<g ').length - 1, 5);
  assert.doesNotMatch(hand, /<circle/);
});

test('svgFor builds a drawing only for the right card counts and rejects repeats', () => {
  assert.ok(svgFor('board', BOARD));
  assert.ok(svgFor('hidden', SHARED));
  assert.ok(svgFor('hand', [...BOARD.slice(0, 2), ...SHARED]));
  assert.equal(svgFor('board', BOARD.slice(0, 15)), null);
  assert.equal(svgFor('hidden', [SHARED[0], SHARED[0], SHARED[1]]), null);
  assert.equal(svgFor('nope', SHARED), null);
});
