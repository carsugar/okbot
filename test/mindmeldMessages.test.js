import { test } from 'node:test';
import assert from 'node:assert/strict';
import { revealText } from '../src/mindmeldMessages.js';
import { MINDMELD_COMMAND } from '../src/commands.js';

const PLAYERS = ['100000000000000001', '100000000000000002'];
const round = (a, b) => ({ [PLAYERS[0]]: a, [PLAYERS[1]]: b });

test('reveal text stays under 2000 characters after 60 worst-case rounds', () => {
  const worst = '*'.repeat(32);
  const history = Array.from({ length: 60 }, () => round(worst, worst));
  for (const matched of [false, true]) {
    const text = revealText({ players: PLAYERS, history, words: history.at(-1), matched, exact: true });
    assert.ok(text.length <= 2000, `matched=${matched} length ${text.length}`);
  }
});

test('long games show the latest round numbered correctly and note omitted rounds', () => {
  const history = Array.from({ length: 30 }, (_, i) => round(`a${i}`, `b${i}`));
  const text = revealText({ players: PLAYERS, history, words: history.at(-1), matched: false, exact: false });
  assert.match(text, /Round 30:/);
  assert.match(text, /earlier rounds/);
  assert.doesNotMatch(text, /Round 1:/);
});

test('markdown and mention syntax inside a word is escaped', () => {
  const history = [round('**', '<@123>')];
  const text = revealText({ players: PLAYERS, history, words: history[0], matched: false, exact: false });
  assert.ok(text.includes('\\*\\*'));
  assert.ok(text.includes('\\<\\@123\\>'));
});

test('short game shows every round and the next-word prompt', () => {
  const history = [round('rain', 'desert')];
  const text = revealText({ players: PLAYERS, history, words: history[0], matched: false, exact: false });
  assert.match(text, /Round 1:/);
  assert.match(text, /connects \*\*rain\*\* and \*\*desert\*\*/);
});

test('matched game announces the meld and notes a non-exact match', () => {
  const history = [round('rain', 'raining')];
  const text = revealText({ players: PLAYERS, history, words: history[0], matched: true, exact: false });
  assert.match(text, /Mind meld!/);
  assert.match(text, /counted as a match/);
});

test('mindmeld command is guild-only so interaction.member always exists', () => {
  assert.deepEqual(MINDMELD_COMMAND.contexts, [0]);
});
