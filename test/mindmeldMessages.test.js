import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lobbyEmbed, revealEmbed, endedEmbed, useButtonId, parseUseId } from '../src/mindmeldMessages.js';
import { MINDMELD_COMMAND } from '../src/commands.js';

const PLAYERS = ['100000000000000001', '100000000000000002'];
const round = (a, b) => ({ [PLAYERS[0]]: a, [PLAYERS[1]]: b });
const BLURPLE = 0x5865f2;
const GOLD = 0xf1c40f;
const GREY = 0x95a5a6;

const reveal = (history, over = {}) =>
  revealEmbed({ players: PLAYERS, history, words: history.at(-1), matched: false, exact: false, ...over });
const embedSize = (e) =>
  e.title.length + e.description.length + (e.footer?.text.length ?? 0) +
  (e.fields ?? []).reduce((n, f) => n + f.name.length + f.value.length, 0);
const assertWithinLimits = (e) => {
  assert.ok(e.description.length <= 4096, `description ${e.description.length}`);
  for (const f of e.fields ?? []) assert.ok(f.value.length <= 1024, `field ${f.value.length}`);
  assert.ok(embedSize(e) <= 6000, `total ${embedSize(e)}`);
};

test('non-final reveal is blurple, titled with the round, and carries the footer', () => {
  const e = reveal([round('rain', 'desert'), round('oasis', 'camel')]);
  assert.equal(e.color, BLURPLE);
  assert.equal(e.title, 'Round 2');
  assert.equal(e.footer.text, "Think this should've been a match? Ping the hosts!");
});

test('non-final reveal shows both words as inline fields and the connect prompt', () => {
  const e = reveal([round('rain', 'desert')]);
  assert.equal(e.fields.length, 2);
  assert.ok(e.fields.every((f) => f.inline));
  assert.ok(e.fields[0].value.includes('**rain**') && e.fields[0].value.includes(`<@${PLAYERS[0]}>`));
  assert.ok(e.fields[1].value.includes('**desert**'));
  assert.match(e.description, /Connect \*\*rain\*\* ⟷ \*\*desert\*\*/);
});

test('earlier rounds appear in the description, the current round does not repeat there', () => {
  const e = reveal([round('rain', 'desert'), round('oasis', 'camel')]);
  assert.match(e.description, /Round 1:/);
  assert.doesNotMatch(e.description, /Round 2:/);
});

test('match is gold, scores the rounds, and has no footer', () => {
  const e = reveal([round('rain', 'desert'), round('oasis', 'oasis')], { matched: true, exact: true });
  assert.equal(e.color, GOLD);
  assert.equal(e.title, '🎉 Mind meld in 2 rounds!');
  assert.equal(e.footer, undefined);
  assert.match(e.description, /Round 2:/);
});

test('a first-round match reads "1 round"', () => {
  const e = reveal([round('rain', 'rain')], { matched: true, exact: true });
  assert.equal(e.title, '🎉 Mind meld in 1 round!');
});

test('counted as a match is noted only when the match was not exact', () => {
  const inexact = reveal([round('rain', 'raining')], { matched: true, exact: false });
  const exact = reveal([round('rain', 'rain')], { matched: true, exact: true });
  assert.match(inexact.description, /counted as a match/);
  assert.doesNotMatch(exact.description, /counted as a match/);
});

test('long games show the last 8 rounds with absolute numbering and an omitted note', () => {
  const history = Array.from({ length: 30 }, (_, i) => round(`a${i}`, `b${i}`));
  const e = reveal(history.slice(0, 29), { matched: false });
  assert.equal(e.title, 'Round 29');
  assert.match(e.description, /earlier rounds not shown/);
  assert.match(e.description, /Round 28:/);
  assert.doesNotMatch(e.description, /Round 1:/);
});

test('markdown and mention syntax inside a word is escaped', () => {
  const e = reveal([round('**', '<@123>')]);
  assert.ok(e.fields[0].value.includes('\\*\\*'));
  assert.ok(e.fields[1].value.includes('\\<\\@123\\>'));
});

test('embeds stay within Discord limits after 60 worst-case rounds', () => {
  const worst = '*'.repeat(32);
  const history = Array.from({ length: 60 }, () => round(worst, worst));
  assertWithinLimits(reveal(history));
  assertWithinLimits(reveal(history, { matched: true, exact: true }));
  assertWithinLimits(endedEmbed({ players: PLAYERS, history, endedBy: PLAYERS[0] }));
});

test('ended embed is grey and names who ended it and the rounds played', () => {
  const e = endedEmbed({ players: PLAYERS, history: [round('rain', 'desert')], endedBy: PLAYERS[1] });
  assert.equal(e.color, GREY);
  assert.equal(e.title, 'Game ended');
  assert.match(e.description, new RegExp(`<@${PLAYERS[1]}>`));
  assert.match(e.description, /1 round/);
});

test('lobby embed is blurple and mentions both players', () => {
  const e = lobbyEmbed(PLAYERS);
  assert.equal(e.color, BLURPLE);
  assert.equal(e.title, 'Mind Meld');
  assert.ok(PLAYERS.every((p) => e.description.includes(`<@${p}>`)));
});

test('use-button id round-trips a word containing colons and stays under 100 chars', () => {
  assert.deepEqual(parseUseId(useButtonId('123', 'a:b:c')), { gameId: '123', word: 'a:b:c' });
  assert.ok(useButtonId('1234567890123456789', 'x'.repeat(32)).length < 100);
});

test('mindmeld command is guild-only so interaction.member always exists', () => {
  assert.deepEqual(MINDMELD_COMMAND.contexts, [0]);
});
