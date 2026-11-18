import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cardLabel, lobbyComponents, soloStartComponents, startId, modeId, lobbyClosedComponents, countdownComponents, lockStatus, boardComponents, hiddenComponents,
  roundComponents, readyStatus, pickerComponents, nextPicker, joinId, ppickId, plockId, nextId, parseId,
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
  assert.match(t, /1\. 16 cards are dealt face up on squares A to P\. You have 30 seconds to memorize them\./);
  assert.match(t, /2\. The cards turn face down and three shared cards are revealed\./);
  assert.match(t, /3\. You have 30 seconds to place your two markers on the squares you think make the best hand\./);
  assert.match(t, /4\. Both hands are revealed\. The stronger poker hand wins the round\./);
  assert.doesNotMatch(t, /first to win/);
  assert.ok(t.includes('<t:1700000060:R>'));
});

test('solo shows the same instructions and a Start button, and no spots or lobby timer', () => {
  const parts = soloStartComponents('123');
  const t = flatTexts(parts);
  assert.match(t, /# 🃏 Memory Poker/);
  assert.match(t, /Memorize sixteen cards, then build the best five-card hand from two of them plus three shared cards\./);
  assert.match(t, /1\. 16 cards are dealt face up on squares A to P\. You have 30 seconds to memorize them\./);
  assert.match(t, /3\. You have 30 seconds to place your two markers/);
  assert.match(t, /4\. Your hand is revealed, and you find out whether it was the best one on the board\./);
  assert.doesNotMatch(t, /Player 1|Lobby|best of 5/i);
  const buttons = rowButtons(parts);
  assert.deepEqual(buttons.map((b) => b.label), ['Start']);
  assert.equal(buttons[0].custom_id, startId('123'));
  assert.deepEqual(parseId(startId('123')), { action: 'start', gameId: '123', round: 0, letter: '' });
});

test('the lobby shows who holds each spot and has one join button per spot', () => {
  const open = flatTexts(lobbyComponents(GAME, [null, null], 1));
  assert.match(open, /Player 1: open/);
  assert.match(open, /Player 2: open/);
  const taken = flatTexts(lobbyComponents(GAME, [A, null], 1));
  assert.ok(taken.includes(`Player 1: <@${A}>`));
  assert.match(taken, /Player 2: open/);
  const buttons = rowButtons(lobbyComponents(GAME, [A, null], 1)).filter((b) => b.type === 2);
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

test('hidden message shows the face-down lettered cards and the shared cards as one picture, with the lock status and no buttons', () => {
  const parts = hiddenComponents(DEAL.shared, 1_700_000_060, ORIGIN, `⏳ <@${A}>`);
  assert.match(texts(parts), /## 🃏 Board hidden/);
  assert.ok(texts(parts).includes('<t:1700000060:R>'));
  assert.ok(texts(parts).includes(`⏳ <@${A}>`));
  assert.deepEqual(images(parts), [`${ORIGIN}/mp/hidden/KSKD2H.png`]);
  assert.equal(parts.filter((c) => c.type === 1).length, 0);
});

const duelResult = (over = {}) => ({
  round: 2, bestOf: 5, outcome: 'win', winner: A,
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
  assert.deepEqual(parseId(ppickId(g, 4, 'K')), { action: 'ppick', gameId: g, round: 4, letter: 'K' });
  assert.deepEqual(parseId(plockId(g, 4)), { action: 'plock', gameId: g, round: 4, letter: '' });
  assert.deepEqual(parseId(nextId(g, 7)), { action: 'next', gameId: g, round: 7, letter: '' });
  for (const id of [joinId(g, 1), ppickId(g, 999, 'P'), plockId(g, 999), nextId(g, 999)]) assert.ok(id.length < 100);
});

test('the ready line shows who is ready for the next round', () => {
  assert.equal(readyStatus([A, B], [A]), `✅ <@${A}> · ⏳ <@${B}> ready for the next round`);
  assert.equal(readyStatus([A, B], []), `⏳ <@${A}> · ⏳ <@${B}> ready for the next round`);
});

test('a duel result asks both players to press Ready, solo has New board', () => {
  const duelParts = roundComponents([A, B], duelResult(), DEAL, ORIGIN, 'g1');
  const soloParts = roundComponents([A], soloResult(true), DEAL, ORIGIN, 'g1');
  assert.deepEqual(duelParts.filter((c) => c.type === 1).flatMap((r) => r.components).map((b) => b.label), ['Ready for next round']);
  assert.deepEqual(soloParts.filter((c) => c.type === 1).flatMap((r) => r.components).map((b) => b.label), ['New board']);
});

test('the ready line sits above the button once someone has pressed it', () => {
  const parts = roundComponents([A, B], duelResult(), DEAL, ORIGIN, 'g1', [A]);
  assert.ok(texts(parts).includes(`✅ <@${A}> · ⏳ <@${B}> ready for the next round`));
  const lastText = parts.findLastIndex((c) => c.type === 10);
  assert.ok(lastText < parts.findIndex((c) => c.type === 1));
});

test('a finished match has no ready button', () => {
  const parts = roundComponents([A, B], duelResult({ round: 4, wins: { [A]: 3, [B]: 1 }, finished: true, matchWinner: A }), DEAL, ORIGIN, 'g1');
  assert.equal(parts.filter((c) => c.type === 1).length, 0);
});

const pickerButtons = (parts) => parts.filter((c) => c.type === 1).flatMap((r) => r.components);

test('the private picker is the same grid, with the picked squares highlighted and Lock in waiting for two', () => {
  const none = pickerComponents('123', 2, 1_700_000_060, '');
  assert.equal(pickerButtons(none).length, 17);
  assert.ok(pickerButtons(none).slice(0, 16).every((b) => b.style === 2));
  assert.equal(pickerButtons(none).at(-1).disabled, true);
  assert.doesNotMatch(texts(none), /Selected/);

  const one = pickerComponents('123', 2, 1_700_000_060, 'C');
  assert.equal(pickerButtons(one).find((b) => b.label === 'C').style, 1);
  assert.equal(pickerButtons(one).find((b) => b.label === 'D').style, 2);
  assert.equal(pickerButtons(one).at(-1).disabled, true);

  const two = pickerComponents('123', 2, 1_700_000_060, 'CJ');
  assert.equal(pickerButtons(two).filter((b) => b.style === 1).length, 2);
  assert.equal(pickerButtons(two).at(-1).disabled, undefined);
  assert.equal(pickerButtons(two).at(-1).custom_id, plockId('123', 2));
  assert.match(texts(two), /Selected: \*\*C \+ J\*\*/);
  assert.ok(texts(two).includes('<t:1700000060:R>'));
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

test('the lobby has a match length selector that defaults to a single round', () => {
  const menu = rowButtons(lobbyComponents(GAME, [null, null], 1)).find((c) => c.type === 3);
  assert.equal(menu.custom_id, modeId(GAME));
  assert.deepEqual(menu.options.map((o) => [o.label, o.value]), [['Single round', '1'], ['Best of 3', '3'], ['Best of 5', '5']]);
  assert.deepEqual(menu.options.filter((o) => o.default).map((o) => o.value), ['1']);
});

test('the lobby selector follows the chosen match length, with no rules sentence about it', () => {
  const parts = lobbyComponents(GAME, [null, null], 1, 3);
  assert.deepEqual(rowButtons(parts).find((c) => c.type === 3).options.filter((o) => o.default).map((o) => o.value), ['3']);
  assert.doesNotMatch(flatTexts(parts), /first to win/);
});

test('the lobby order is dropdown, then join buttons, then the closing time last, with gaps between', () => {
  const kinds = lobbyComponents(GAME, [null, null], 1_700_000_060).map((c) => (c.type === 1 ? `row:${c.components[0].type}` : c.type));
  assert.deepEqual(kinds, [10, 10, 'row:3', 14, 'row:2', 14, 10]);
  const last = lobbyComponents(GAME, [null, null], 1_700_000_060).at(-1);
  assert.match(last.content, /Lobby closes <t:1700000060:R>/);
});

test('the countdown score line uses the match length', () => {
  assert.match(flatTexts(countdownComponents(3, [A, B], 2, { [A]: 1, [B]: 0 }, 3)), /first to 2/);
  assert.match(flatTexts(countdownComponents(3, [A, B], 4, { [A]: 1, [B]: 1 }, 3)), /extra round/);
});

test('a result saved without a match length still shows a number', () => {
  const { bestOf, ...old } = duelResult();
  assert.match(texts(roundComponents([A, B], old, DEAL, ORIGIN)), /first to 3/);
});

const pressed = (markers) => ({
  components: pickerComponents('123', 2, 1_700_000_060, markers, 'https://x.dev/mp/shared/KSKDKC.png'),
  attachments: [{ id: '9', filename: 'shared-KSKDKC.png' }],
});
const selectedOf = (parts) => pickerButtons(parts).filter((b) => b.style === 1).map((b) => b.label);

test('a press is worked out from the picker message itself', () => {
  assert.deepEqual(selectedOf(nextPicker(pressed(''), '123', 2, 'C', 'https://x.dev')), ['C']);
  assert.deepEqual(selectedOf(nextPicker(pressed('C'), '123', 2, 'J', 'https://x.dev')), ['C', 'J']);
  assert.deepEqual(selectedOf(nextPicker(pressed('CJ'), '123', 2, 'C', 'https://x.dev')), ['J']);
  const third = nextPicker(pressed('CJ'), '123', 2, 'A', 'https://x.dev');
  assert.deepEqual(selectedOf(third), ['A', 'J']);
  assert.match(texts(third), /Selected: \*\*J \+ A\*\*/);
  assert.ok(texts(third).includes('<t:1700000060:R>'));
  assert.equal(third.find((c) => c.type === 12).items[0].media.url, 'https://x.dev/mp/shared/KSKDKC.png');
});

test('a message that is not a picker gives no guess', () => {
  assert.equal(nextPicker(undefined, '123', 2, 'C', 'https://x.dev'), null);
  assert.equal(nextPicker({ components: [], attachments: [] }, '123', 2, 'C', 'https://x.dev'), null);
});
