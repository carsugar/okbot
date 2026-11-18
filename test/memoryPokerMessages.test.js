import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cardLabel, startText, boardText, hiddenText, roundText, modalLabel,
  showId, answerId, nextId, modalId, parseId,
} from '../src/memoryPokerMessages.js';

const SPACER = '​';
const [A, B] = ['100000000000000001', '100000000000000002'];
const RANK = { 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, 10: 10, J: 11, Q: 12, K: 13, A: 14 };
const card = (s) => ({ rank: RANK[s.slice(0, -1)], suit: s.slice(-1) });
const cards = (s) => s.split(' ').map(card);
const DEAL = { board: cards('4S 4H KH KC 2D 3D 5H 9C JD QC 7S 8H 10C 6D 2S 3C'), shared: cards('KS KD 2H') };
const hand = (category, ranks) => ({ category, ranks });
const LIMIT = 2000;

test('cardLabel shows rank and suit symbol', () => {
  assert.equal(cardLabel(card('KS')), 'K♠');
  assert.equal(cardLabel(card('10H')), '10♥');
  assert.equal(cardLabel(card('AD')), 'A♦');
  assert.equal(cardLabel(card('JC')), 'J♣');
  assert.equal(cardLabel(card('QS')), 'Q♠');
  assert.equal(cardLabel(card('2H')), '2♥');
});

test('duel start card names both players, then a spacer, and ends with a spacer for the buttons', () => {
  const t = startText([A, B], 1, { [A]: 0, [B]: 0 });
  const lines = t.split('\n');
  assert.match(lines[0], /^# 🃏 Memory Poker: /);
  assert.ok(lines[0].includes(`<@${A}>`) && lines[0].includes(`<@${B}>`));
  assert.equal(lines[1], SPACER);
  assert.equal(lines.at(-1), SPACER);
  assert.match(t, /## How to play:/);
  assert.match(t, /Show me my board/);
  assert.match(t, /best of 5/i);
});

test('solo start card has one player-free title and promises to say if you found the best hand', () => {
  const t = startText([A], 1, { [A]: 0 });
  assert.match(t, /^# 🃏 Memory Poker\n/);
  assert.doesNotMatch(t, /<@/);
  assert.match(t, /best hand/i);
  assert.equal(t.split('\n').at(-1), SPACER);
});

test('later duel rounds show the round, the score and what to do', () => {
  const t = startText([A, B], 3, { [A]: 1, [B]: 1 });
  assert.match(t, /^# 🃏 Round 3: /);
  assert.ok(t.includes(`<@${A}> 1`) && t.includes(`<@${B}> 1`));
  assert.match(t, /first to 3/i);
  assert.match(t, /Show me my board/);
  assert.equal(t.split('\n').at(-1), SPACER);
});

test('later solo rounds are a new board', () => {
  assert.match(startText([A], 2, { [A]: 0 }), /^# 🃏 New board\n/);
});

test('board text lists all 16 squares with their cards in a four-row block and a countdown', () => {
  const t = boardText(DEAL.board, 1_700_000_000);
  assert.match(t, /## 🃏 Memorize the board/);
  assert.ok(t.includes('<t:1700000000:R>'));
  const block = t.match(/```\n([\s\S]*?)\n```/)[1].split('\n');
  assert.equal(block.length, 4);
  assert.ok(block[0].startsWith('A 4♠'));
  assert.ok(block[3].includes('P 3♣'));
  for (const letter of 'ABCDEFGHIJKLMNOP') assert.ok(t.includes(`${letter} `), letter);
  assert.ok(block[3].includes('M 10♣'));
});

test('hidden text lists the three shared cards and the answer deadline', () => {
  const t = hiddenText(DEAL.shared, 1_700_000_060);
  assert.match(t, /## 🃏 Board hidden/);
  assert.ok(t.includes('K♠  K♦  2♥'));
  assert.ok(t.includes('<t:1700000060:R>'));
  assert.equal(t.split('\n').at(-1), SPACER);
});

const duelResult = (over = {}) => ({
  round: 2, outcome: 'win', winner: A,
  hands: { [A]: hand(7, [13, 2]), [B]: hand(2, [13, 4, 2]) },
  picks: { [A]: [2, 3], [B]: [0, 1] },
  forfeited: [], wins: { [A]: 1, [B]: 0 }, finished: false, matchWinner: null, analysis: null,
  ...over,
});

test('a duel round shows each hand with its squares and cards, the winner and the score', () => {
  const t = roundText([A, B], duelResult(), DEAL);
  assert.match(t, /## 🃏 Round 2/);
  assert.ok(t.includes(`<@${A}>`) && t.includes('**Four of a kind**'));
  assert.ok(t.includes('C K♥ + D K♣ with K♠ K♦ 2♥'));
  assert.ok(t.includes('A 4♠ + B 4♥ with K♠ K♦ 2♥'));
  assert.ok(t.includes('**Two pair**'));
  assert.match(t, new RegExp(`## 🏆 <@${A}> takes the round`));
  assert.ok(t.includes(`Score: <@${A}> 1 · <@${B}> 0 · first to 3`));
  assert.equal(t.split('\n').at(-1), SPACER);
});

test('a drawn round says draw', () => {
  const t = roundText([A, B], duelResult({ outcome: 'draw', winner: null, hands: { [A]: hand(2, [13, 4, 2]), [B]: hand(2, [13, 4, 2]) } }), DEAL);
  assert.match(t, /## 🤝 Draw/);
});

test('a forfeited player is shown as out of time instead of cards', () => {
  const t = roundText([A, B], duelResult({
    hands: { [A]: hand(7, [13, 2]), [B]: null }, picks: { [A]: [2, 3], [B]: null }, forfeited: [B],
  }), DEAL);
  assert.ok(t.includes(`<@${B}> · ran out of time`));
  assert.doesNotMatch(t, /A 4♠/);
});

test('a finished match announces the winner and the score, with no button spacer', () => {
  const t = roundText([A, B], duelResult({ round: 4, wins: { [A]: 3, [B]: 1 }, finished: true, matchWinner: A }), DEAL);
  assert.match(t, new RegExp(`# 🏆 <@${A}> wins the match, 3 to 1`));
  assert.doesNotMatch(t, /first to 3/);
  assert.notEqual(t.split('\n').at(-1), SPACER);
});

const soloResult = (found) => ({
  round: 1, outcome: 'solo', winner: null,
  hands: { [A]: found ? hand(7, [13, 2]) : hand(2, [13, 4, 2]) },
  picks: { [A]: found ? [2, 3] : [0, 1] },
  forfeited: [], wins: { [A]: 0 }, finished: false, matchWinner: null,
  analysis: {
    found, total: 120, beaten: found ? 119 : 87,
    best: { picks: [2, 3], hand: hand(7, [13, 2]) },
    yours: { picks: found ? [2, 3] : [0, 1], hand: found ? hand(7, [13, 2]) : hand(2, [13, 4, 2]) },
  },
});

test('solo says you found the best hand', () => {
  const t = roundText([A], soloResult(true), DEAL);
  assert.match(t, /## 🃏 You found the best hand!/);
  assert.ok(t.includes('C K♥ + D K♣ with K♠ K♦ 2♥'));
  assert.equal(t.split('\n').at(-1), SPACER);
});

test('solo shows your pick, the best pick and how many of the 120 you beat', () => {
  const t = roundText([A], soloResult(false), DEAL);
  assert.match(t, /## 🃏 Not quite/);
  assert.ok(t.includes('**A + B**') && t.includes('**Two pair**'));
  assert.ok(t.includes('**C + D**') && t.includes('**Four of a kind**'));
  assert.ok(t.includes('beat 87 of the 120'));
});

test('a solo forfeit says time ran out', () => {
  const t = roundText([A], { ...soloResult(false), hands: { [A]: null }, picks: { [A]: null }, forfeited: [A], analysis: null }, DEAL);
  assert.match(t, /## 🃏 Out of time/);
});

test('every text stays well under the 2000 character limit with long mention ids', () => {
  const players = ['9'.repeat(20), '8'.repeat(20)];
  const worst = duelResult({ wins: { [players[0]]: 2, [players[1]]: 2 }, winner: players[0] });
  const texts = [
    startText(players, 1, { [players[0]]: 0, [players[1]]: 0 }),
    startText(players, 40, { [players[0]]: 9, [players[1]]: 9 }),
    boardText(DEAL.board, 1_700_000_000),
    hiddenText(DEAL.shared, 1_700_000_060),
    roundText(players, { ...worst, hands: { [players[0]]: hand(7, [13, 2]), [players[1]]: hand(2, [13, 4, 2]) }, picks: { [players[0]]: [2, 3], [players[1]]: [0, 1] } }, DEAL),
  ];
  for (const t of texts) assert.ok(t.length <= LIMIT, `length ${t.length}`);
});

test('modal label fits Discord 45 characters', () => {
  assert.equal(modalLabel, 'Two squares, like C J');
  assert.ok(modalLabel.length <= 45);
});

test('ids round trip action, game and round, and stay under 100 characters', () => {
  const g = '1234567890123456789';
  assert.deepEqual(parseId(showId(g, 4)), { action: 'show', gameId: g, round: 4 });
  assert.deepEqual(parseId(answerId(g, 12)), { action: 'answer', gameId: g, round: 12 });
  assert.deepEqual(parseId(nextId(g, 7)), { action: 'next', gameId: g, round: 7 });
  assert.deepEqual(parseId(modalId(g, 9)), { action: 'modal', gameId: g, round: 9 });
  for (const id of [showId(g, 999), answerId(g, 999), nextId(g, 999), modalId(g, 999)]) assert.ok(id.length < 100);
});

test('memorypoker command is guild-only and the opponent is optional', async () => {
  const { MEMORYPOKER_COMMAND } = await import('../src/commands.js');
  assert.equal(MEMORYPOKER_COMMAND.name, 'memorypoker');
  assert.deepEqual(MEMORYPOKER_COMMAND.contexts, [0]);
  const opponent = MEMORYPOKER_COMMAND.options.find((o) => o.name === 'opponent');
  assert.equal(opponent.type, 6);
  assert.notEqual(opponent.required, true);
});
