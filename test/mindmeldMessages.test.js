import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lobbyText, revealText, endedText, useButtonId, parseUseId } from '../src/mindmeldMessages.js';
import { MINDMELD_COMMAND } from '../src/commands.js';

const [A, B] = ['100000000000000001', '100000000000000002'];
const PLAYERS = [A, B];
const round = (a, b) => ({ [A]: a, [B]: b });
const LIMIT = 2000;

const reveal = (history, over = {}) =>
  revealText({ players: PLAYERS, history, words: history.at(-1), matched: false, exact: false, ...over });

test('non-final reveal has a round header, one big line per player, and the connect prompt', () => {
  const t = reveal([round('rain', 'desert'), round('oasis', 'camel')]);
  assert.match(t, /## 🧠 Round 2\n\n/);
  assert.match(t, new RegExp(`> ### <@${A}> → \\*\\*oasis\\*\\*\\n> ### <@${B}> → \\*\\*camel\\*\\*`));
  assert.match(t, /### 🔗 Connect \*\*oasis\*\* ⟷ \*\*camel\*\*/);
});

test('sections are separated by blank lines', () => {
  const t = reveal([round('rain', 'desert'), round('oasis', 'camel')]);
  assert.ok(t.includes('\n\n### 🔗'));
  assert.ok(t.includes('\n\n## 🧠 Round 2'));
});

test('earlier rounds are small print and the current round is not repeated there', () => {
  const t = reveal([round('rain', 'desert'), round('oasis', 'camel')]);
  assert.match(t, /-# Round 1 · <@100000000000000001> rain/);
  assert.doesNotMatch(t, /-# Round 2/);
});

test('history comes first and the current round sits below it', () => {
  const t = reveal([round('rain', 'desert'), round('oasis', 'camel')]);
  assert.ok(t.startsWith('-# 📜 Earlier rounds\n'));
  assert.ok(t.indexOf('Round 1 ·') < t.indexOf('## 🧠 Round 2'));
  assert.ok(t.indexOf('## 🧠 Round 2') < t.indexOf('Connect'));
});

test('first round has no earlier-rounds section and starts with its own header', () => {
  assert.ok(reveal([round('rain', 'desert')]).startsWith('## 🧠 Round 1'));
});

test('first round has no earlier-rounds section', () => {
  assert.doesNotMatch(reveal([round('rain', 'desert')]), /Earlier rounds/);
});

test('non-final reveal ends with the host-ping footer, match has none', () => {
  assert.ok(reveal([round('rain', 'desert')]).trimEnd().endsWith("-# Think this should've been a match? Ping the hosts!"));
  assert.doesNotMatch(reveal([round('rain', 'rain')], { matched: true, exact: true }), /Ping the hosts/);
});

test('match shows a big banner, the score, a divider and the chain', () => {
  const t = reveal([round('rain', 'desert'), round('oasis', 'oasis')], { matched: true, exact: true });
  assert.match(t, /^# 🎉 MIND MELD! 🎉\n\n## ⭐ 2 rounds ⭐\n\n▰+\n\n/);
  assert.match(t, /> Round 1 · /);
  assert.match(t, /> ### Round 2 · /);
});

test('a first-round match reads "1 round"', () => {
  assert.match(reveal([round('rain', 'rain')], { matched: true, exact: true }), /## ⭐ 1 round ⭐/);
});

test('counted as a match is noted only when the match was not exact', () => {
  const inexact = reveal([round('rain', 'raining')], { matched: true, exact: false });
  const exact = reveal([round('rain', 'rain')], { matched: true, exact: true });
  assert.match(inexact, /counted as a match/);
  assert.doesNotMatch(exact, /counted as a match/);
});

test('long games show the last 6 rounds with real numbering and an omitted note', () => {
  const history = Array.from({ length: 30 }, (_, i) => round(`a${i}`, `b${i}`));
  const t = reveal(history.slice(0, 29));
  assert.match(t, /## 🧠 Round 29/);
  assert.match(t, /earlier rounds not shown/);
  assert.match(t, /Round 28 · /);
  assert.doesNotMatch(t, /Round 1 · /);
});

test('markdown, mention and link syntax inside a word is escaped', () => {
  const t = reveal([round('**', '<@123>')]);
  assert.ok(t.includes('\\*\\*'));
  assert.ok(t.includes('\\<\\@123\\>'));
  assert.ok(reveal([round('[a](http://b.c)', 'x')]).includes('\\[a\\]\\(http://b.c\\)'));
});

test('messages stay under 2000 characters after 60 worst-case rounds', () => {
  const worst = '*'.repeat(32);
  const history = Array.from({ length: 60 }, () => round(worst, worst));
  for (const text of [
    reveal(history),
    reveal(history, { matched: true, exact: false }),
    endedText({ players: PLAYERS, history, endedBy: A }),
  ]) assert.ok(text.length <= LIMIT, `length ${text.length}`);
});

test('ended message names who ended it, the rounds played, and says no score', () => {
  const t = endedText({ players: PLAYERS, history: [round('rain', 'desert')], endedBy: B });
  assert.match(t, /^## 🏁 Game ended\n\n/);
  assert.match(t, new RegExp(`<@${B}> called it after \\*\\*1 round\\*\\*. No score.`));
});

test('lobby is a big title, both players, and the how-to in a quote', () => {
  const t = lobbyText(PLAYERS);
  assert.match(t, /^# 🧠 MIND MELD\n\n/);
  assert.ok(t.includes(`<@${A}> 🤝 <@${B}>`));
  assert.match(t, /\n> /);
});

test('use-button id round-trips the round and a word containing colons, under 100 chars', () => {
  assert.deepEqual(parseUseId(useButtonId('123', 4, 'a:b:c')), { gameId: '123', round: 4, word: 'a:b:c' });
  assert.ok(useButtonId('1234567890123456789', 120, 'x'.repeat(32)).length < 100);
});

test('mindmeld command is guild-only so interaction.member always exists', () => {
  assert.deepEqual(MINDMELD_COMMAND.contexts, [0]);
});
