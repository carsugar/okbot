import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cardLabel, lobbyComponents, lobbyClosedComponents, countdownComponents, lockStatus, boardComponents, hiddenComponents,
  roundComponents, markerRows, joinId, pickId, nextId, parseId,
} from '../src/memoryPokerMessages.js';

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

const GAME = '1234567890123456789';
const flatTexts = (parts) => parts.flatMap((c) => (c.type === 10 ? [c.content] : [])).join('\n');
const rowButtons = (parts) => parts.filter((c) => c.type === 1).flatMap((r) => r.components);

test('the lobby carries the instructions with the exact timings', () => {
  const t = flatTexts(lobbyComponents(GAME, [null, null], 1_700_000_060));
  assert.match(t, /# 🃏 Memory Poker/);
  assert.match(t, /Memorize sixteen cards, then build the best five-card hand from two of them plus three shared cards\./);
  assert.match(t, /## How to play:/);
  assert.match(t, /1\. 16 cards are dealt face up on squares A to P\. You have 20 seconds to memorize them\./);
  assert.match(t, /2\. The cards turn face down and three shared cards are revealed\./);
  assert.match(t, /3\. You have 30 seconds to place your two markers on the squares you think make the best hand\./);
  assert.match(t, /4\. Both hands are revealed\. The stronger poker hand wins the round\./);
  assert.match(t, /best of 5/i);
  assert.ok(t.includes('<t:1700000060:R>'));
});

test('the lobby shows who holds each spot and has one join button per spot', () => {
  const open = flatTexts(lobbyComponents(GAME, [null, null], 1));
  assert.match(open, /Player 1: open/);
  assert.match(open, /Player 2: open/);
  const taken = flatTexts(lobbyComponents(GAME, [A, null], 1));
  assert.ok(taken.includes(`Player 1: <@${A}>`));
  assert.match(taken, /Player 2: open/);
  const buttons = rowButtons(lobbyComponents(GAME, [A, null], 1));
  assert.deepEqual(buttons.map((b) => b.label), ['Join as Player 1', 'Join as Player 2']);
  assert.deepEqual(buttons.map((b) => b.custom_id), [joinId(GAME, 0), joinId(GAME, 1)]);
});

test('a closed lobby says so and has no buttons', () => {
  const parts = lobbyClosedComponents();
  assert.match(flatTexts(parts), /Lobby closed/);
  assert.equal(rowButtons(parts).length, 0);
});

test('the countdown shows the number, and later rounds show the score', () => {
  assert.match(flatTexts(countdownComponents(5, [A, B], 1, { [A]: 0, [B]: 0 })), /Starting in 5/);
  const t = flatTexts(countdownComponents(3, [A, B], 3, { [A]: 1, [B]: 1 }));
  assert.match(t, /Round 3/);
  assert.ok(t.includes(`<@${A}> 1 · <@${B}> 1`));
  assert.match(t, /Starting in 3/);
});

test('a solo countdown has no players and is a new board', () => {
  const t = flatTexts(countdownComponents(2, [A], 2, { [A]: 0 }));
  assert.match(t, /New board/);
  assert.doesNotMatch(t, /<@/);
});

test('lock status shows who has locked in and who is still picking', () => {
  const per = { [A]: { answer: [0, 1], forfeited: false }, [B]: { answer: null, forfeited: false } };
  assert.equal(lockStatus([A, B], per), `✅ <@${A}> · ⏳ <@${B}>`);
  const forfeit = { [A]: { answer: null, forfeited: true }, [B]: { answer: null, forfeited: false } };
  assert.equal(lockStatus([A, B], forfeit), `⌛ <@${A}> · ⏳ <@${B}>`);
});

const ORIGIN = 'https://okbot.example.dev';
const texts = (parts) => parts.filter((c) => c.type === 10).map((c) => c.content).join('\n');
const images = (parts) => parts.filter((c) => c.type === 12).map((c) => c.items[0].media.url);
const boardUrl = `${ORIGIN}/mp/board/4S4HKHKC2D3D5H9CJDQC7S8HTC6D2S3C.png`;

test('board message is a title with a countdown and the board picture', () => {
  const parts = boardComponents(DEAL.board, 1_700_000_000, ORIGIN);
  assert.match(texts(parts), /## 🃏 Memorize the board/);
  assert.ok(texts(parts).includes('<t:1700000000:R>'));
  assert.deepEqual(images(parts), [boardUrl]);
});

test('hidden message shows the face-down lettered cards and the shared cards as one picture, with the lock status', () => {
  const parts = hiddenComponents(DEAL.shared, 1_700_000_060, ORIGIN, `⏳ <@${A}>`);
  assert.match(texts(parts), /## 🃏 Board hidden/);
  assert.ok(texts(parts).includes('<t:1700000060:R>'));
  assert.ok(texts(parts).includes(`⏳ <@${A}>`));
  assert.deepEqual(images(parts), [`${ORIGIN}/mp/hidden/KSKD2H.png`]);
});

const duelResult = (over = {}) => ({
  round: 2, outcome: 'win', winner: A,
  hands: { [A]: hand(7, [13, 2]), [B]: hand(2, [13, 4, 2]) },
  picks: { [A]: [2, 3], [B]: [0, 1] },
  forfeited: [], wins: { [A]: 1, [B]: 0 }, finished: false, matchWinner: null, analysis: null,
  ...over,
});

test('a duel round shows each hand name and squares, a hand picture each, the winner and the score', () => {
  const parts = roundComponents([A, B], duelResult(), DEAL, ORIGIN);
  const t = texts(parts);
  assert.match(t, /## 🃏 Round 2/);
  assert.ok(t.includes(`<@${A}> · **Four of a kind** · C + D`));
  assert.ok(t.includes(`<@${B}> · **Two pair** · A + B`));
  assert.deepEqual(images(parts), [`${ORIGIN}/mp/hand/KHKCKSKD2H.png`, `${ORIGIN}/mp/hand/4S4HKSKD2H.png`]);
  assert.match(t, new RegExp(`## 🏆 <@${A}> takes the round`));
  assert.ok(t.includes(`Score: <@${A}> 1 · <@${B}> 0 · first to 3`));
});

test('each player picture sits right under that player heading', () => {
  const parts = roundComponents([A, B], duelResult(), DEAL, ORIGIN);
  const at = parts.findIndex((c) => c.type === 10 && c.content.includes(`<@${A}> ·`));
  assert.equal(parts[at + 1].type, 12);
});

test('a drawn round says draw', () => {
  const t = texts(roundComponents([A, B], duelResult({ outcome: 'draw', winner: null, hands: { [A]: hand(2, [13, 4, 2]), [B]: hand(2, [13, 4, 2]) } }), DEAL, ORIGIN));
  assert.match(t, /## 🤝 Draw/);
});

test('a forfeited player is shown as out of time with no picture', () => {
  const parts = roundComponents([A, B], duelResult({
    hands: { [A]: hand(7, [13, 2]), [B]: null }, picks: { [A]: [2, 3], [B]: null }, forfeited: [B],
  }), DEAL, ORIGIN);
  assert.ok(texts(parts).includes(`<@${B}> · ran out of time`));
  assert.equal(images(parts).length, 1);
});

test('a finished match announces the winner and the score, without the next-round score line', () => {
  const t = texts(roundComponents([A, B], duelResult({ round: 4, wins: { [A]: 3, [B]: 1 }, finished: true, matchWinner: A }), DEAL, ORIGIN));
  assert.match(t, new RegExp(`# 🏆 <@${A}> wins the match, 3 to 1`));
  assert.doesNotMatch(t, /first to 3/);
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

test('solo says you found the best hand, with a picture of it', () => {
  const parts = roundComponents([A], soloResult(true), DEAL, ORIGIN);
  assert.match(texts(parts), /## 🃏 You found the best hand!/);
  assert.deepEqual(images(parts), [`${ORIGIN}/mp/hand/KHKCKSKD2H.png`]);
});

test('solo shows your pick and the best pick, each with a picture, and how many of the 120 you beat', () => {
  const parts = roundComponents([A], soloResult(false), DEAL, ORIGIN);
  const t = texts(parts);
  assert.match(t, /## 🃏 Not quite/);
  assert.ok(t.includes('**A + B**') && t.includes('**Two pair**'));
  assert.ok(t.includes('**C + D**') && t.includes('**Four of a kind**'));
  assert.ok(t.includes('beat 87 of the 120'));
  assert.deepEqual(images(parts), [`${ORIGIN}/mp/hand/4S4HKSKD2H.png`, `${ORIGIN}/mp/hand/KHKCKSKD2H.png`]);
});

test('a solo forfeit says time ran out', () => {
  const t = texts(roundComponents([A], { ...soloResult(false), hands: { [A]: null }, picks: { [A]: null }, forfeited: [A], analysis: null }, DEAL, ORIGIN));
  assert.match(t, /## 🃏 Out of time/);
});

test('every text stays well under Discord limits with long mention ids', () => {
  const players = ['9'.repeat(20), '8'.repeat(20)];
  const worst = duelResult({ wins: { [players[0]]: 2, [players[1]]: 2 }, winner: players[0] });
  const all = [
    flatTexts(lobbyComponents(GAME, players, 1_700_000_060)),
    flatTexts(countdownComponents(5, players, 40, { [players[0]]: 9, [players[1]]: 9 })),
    texts(boardComponents(DEAL.board, 1_700_000_000, ORIGIN)),
    texts(hiddenComponents(DEAL.shared, 1_700_000_060, ORIGIN)),
    texts(roundComponents(players, { ...worst, hands: { [players[0]]: hand(7, [13, 2]), [players[1]]: hand(2, [13, 4, 2]) }, picks: { [players[0]]: [2, 3], [players[1]]: [0, 1] } }, DEAL, ORIGIN)),
  ];
  for (const t of all) assert.ok(t.length <= LIMIT, `length ${t.length}`);
});

test('ids round trip action, game, round and square, and stay under 100 characters', () => {
  const g = '1234567890123456789';
  assert.deepEqual(parseId(joinId(g, 1)), { action: 'join', gameId: g, round: 1, letter: '' });
  assert.deepEqual(parseId(pickId(g, 12, 'J')), { action: 'pick', gameId: g, round: 12, letter: 'J' });
  assert.deepEqual(parseId(nextId(g, 7)), { action: 'next', gameId: g, round: 7, letter: '' });
  for (const id of [joinId(g, 1), pickId(g, 999, 'P'), nextId(g, 999)]) assert.ok(id.length < 100);
});

test('the marker buttons are the sixteen squares in four rows of four, available straight away', () => {
  const rows = markerRows('123', 2);
  assert.equal(rows.length, 4);
  assert.deepEqual(rows.map((r) => r.components.map((b) => b.label).join('')), ['ABCD', 'EFGH', 'IJKL', 'MNOP']);
  assert.deepEqual(rows[1].components[2].custom_id, pickId('123', 2, 'G'));
  assert.ok(rows.every((r) => r.components.every((b) => b.disabled === undefined)));
});

test('memorypoker command is guild-only and solo is an optional yes/no', async () => {
  const { MEMORYPOKER_COMMAND } = await import('../src/commands.js');
  assert.equal(MEMORYPOKER_COMMAND.name, 'memorypoker');
  assert.deepEqual(MEMORYPOKER_COMMAND.contexts, [0]);
  assert.deepEqual(MEMORYPOKER_COMMAND.options.map((o) => o.name), ['solo']);
  const solo = MEMORYPOKER_COMMAND.options[0];
  assert.equal(solo.type, 5);
  assert.notEqual(solo.required, true);
});
