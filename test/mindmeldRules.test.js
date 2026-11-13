import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeWord, wordsMatch, newGame, submitWord, preflight, endGame } from '../src/mindmeldRules.js';

const A = 'user-a';
const B = 'user-b';
const fresh = () => newGame([A, B], 1000);

test('normalizeWord trims and lowercases', () => {
  assert.equal(normalizeWord(' Rain '), 'rain');
});

test('normalizeWord rejects empty, multi-word and 33+ char input', () => {
  assert.equal(normalizeWord(''), null);
  assert.equal(normalizeWord('   '), null);
  assert.equal(normalizeWord('two words'), null);
  assert.equal(normalizeWord('a'.repeat(33)), null);
});

test('normalizeWord accepts exactly 32 characters', () => {
  assert.equal(normalizeWord('a'.repeat(32)), 'a'.repeat(32));
});

test('wordsMatch accepts plurals, tenses and irregular forms', () => {
  for (const [x, y] of [['rain', 'raining'], ['mouse', 'mice'], ['leaf', 'leaves'], ['run', 'ran'], ['cat', 'cats']]) {
    assert.equal(wordsMatch(x, y), true, `${x}/${y}`);
  }
});

test('wordsMatch rejects unrelated and derived words', () => {
  for (const [x, y] of [['universe', 'university'], ['happy', 'happiness'], ['rain', 'train'], ['desert', 'dessert']]) {
    assert.equal(wordsMatch(x, y), false, `${x}/${y}`);
  }
});

test('first word is stored as typed (trimmed) and reports waiting', () => {
  const { state, result } = submitWord(fresh(), A, ' Rain ', 2000);
  assert.equal(result.type, 'waiting');
  assert.deepEqual(state.pending, { [A]: 'Rain' });
  assert.equal(state.updatedAt, 2000);
});

test('second non-matching word reveals round 1 and clears pending', () => {
  const s1 = submitWord(fresh(), A, 'rain', 2000).state;
  const { state, result } = submitWord(s1, B, 'desert', 3000);
  assert.deepEqual(result, { type: 'revealed', round: 1, words: { [A]: 'rain', [B]: 'desert' }, matched: false, exact: false });
  assert.equal(state.history.length, 1);
  assert.deepEqual(state.pending, {});
  assert.equal(state.status, 'active');
});

test('same player submitting twice in a round keeps the first word', () => {
  const s1 = submitWord(fresh(), A, 'rain', 2000).state;
  const { state, result } = submitWord(s1, A, 'storm', 3000);
  assert.equal(result.type, 'already_submitted');
  assert.deepEqual(state.pending, { [A]: 'rain' });
});

test('outsider is refused and state is unchanged', () => {
  const g = fresh();
  const { state, result } = submitWord(g, 'user-c', 'rain', 2000);
  assert.equal(result.type, 'not_player');
  assert.deepEqual(state, g);
});

test('multi-word input is invalid and stores nothing', () => {
  const g = fresh();
  const { state, result } = submitWord(g, A, 'two words', 2000);
  assert.equal(result.type, 'invalid');
  assert.deepEqual(state, g);
});

test('exact match with different case wins immediately', () => {
  const s1 = submitWord(fresh(), A, 'Rain', 2000).state;
  const { state, result } = submitWord(s1, B, 'rain', 3000);
  assert.equal(result.type, 'revealed');
  assert.equal(result.matched, true);
  assert.equal(result.exact, true);
  assert.equal(state.status, 'won');
});

test('lemma match is reported as matched but not exact', () => {
  const s1 = submitWord(fresh(), A, 'rain', 2000).state;
  const { result } = submitWord(s1, B, 'raining', 3000);
  assert.equal(result.matched, true);
  assert.equal(result.exact, false);
});

test('submitting after the game is won returns finished and changes nothing', () => {
  const s1 = submitWord(fresh(), A, 'rain', 2000).state;
  const won = submitWord(s1, B, 'rain', 3000).state;
  const { state, result } = submitWord(won, A, 'storm', 4000);
  assert.equal(result.type, 'finished');
  assert.deepEqual(state, won);
});

test('a second round after a non-match reports round 2', () => {
  let s = submitWord(fresh(), A, 'rain', 2000).state;
  s = submitWord(s, B, 'desert', 3000).state;
  s = submitWord(s, A, 'oasis', 4000).state;
  const { result } = submitWord(s, B, 'camel', 5000);
  assert.equal(result.round, 2);
  assert.equal(result.matched, false);
});

// ── preflight, repeats, end game ──────────────────────────────────────────────

const play = (state, ...moves) =>
  moves.reduce((s, [user, word], i) => submitWord(s, user, word, 2000 + i).state, state);
const afterRound1 = () => play(fresh(), [A, 'rain'], [B, 'desert']);

test('preflight returns ok for a fresh valid word', () => {
  assert.deepEqual(preflight(fresh(), A, 'rain'), { type: 'ok' });
});

test('preflight refuses invalid, outsider, double submit, won and ended games', () => {
  assert.equal(preflight(fresh(), A, 'two words').type, 'invalid');
  assert.equal(preflight(fresh(), 'user-c', 'rain').type, 'not_player');
  assert.equal(preflight(play(fresh(), [A, 'rain']), A, 'storm').type, 'already_submitted');
  assert.equal(preflight(play(fresh(), [A, 'rain'], [B, 'rain']), A, 'storm').type, 'finished');
  assert.equal(preflight(endGame(fresh(), A, 5000).state, A, 'storm').type, 'ended');
});

test('a word already revealed is a repeat, for either player, and changes nothing', () => {
  const s = afterRound1();
  for (const [user, word] of [[A, 'Rain'], [A, 'rains'], [B, 'desert'], [B, 'rain']]) {
    const { state, result } = submitWord(s, user, word, 9000);
    assert.equal(result.type, 'repeat', `${user} ${word}`);
    assert.deepEqual(state, s);
  }
  assert.equal(submitWord(s, A, 'oasis', 9000).result.type, 'waiting');
});

test('a partner hidden word is not a repeat: entering it is a match', () => {
  const s = play(afterRound1(), [A, 'oasis']);
  const { result } = submitWord(s, B, 'oasis', 9000);
  assert.equal(result.type, 'revealed');
  assert.equal(result.matched, true);
});

test('endGame ends an active game and reports rounds played', () => {
  const { state, result } = endGame(afterRound1(), A, 7000);
  assert.deepEqual(result, { type: 'ended_now', rounds: 1 });
  assert.equal(state.status, 'ended');
  assert.equal(state.updatedAt, 7000);
});

test('endGame refuses outsiders, won games and already ended games without changing state', () => {
  const active = afterRound1();
  assert.equal(endGame(active, 'user-c', 7000).result.type, 'not_player');
  const won = play(fresh(), [A, 'rain'], [B, 'rain']);
  const wonEnd = endGame(won, A, 7000);
  assert.equal(wonEnd.result.type, 'finished');
  assert.deepEqual(wonEnd.state, won);
  const ended = endGame(active, A, 7000).state;
  const again = endGame(ended, B, 8000);
  assert.equal(again.result.type, 'ended');
  assert.deepEqual(again.state, ended);
});

test('submitWord on an ended game returns ended and changes nothing', () => {
  const ended = endGame(afterRound1(), A, 7000).state;
  const { state, result } = submitWord(ended, A, 'oasis', 8000);
  assert.equal(result.type, 'ended');
  assert.deepEqual(state, ended);
});
