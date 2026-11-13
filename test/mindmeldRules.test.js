import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeWord, wordsMatch, newGame, submitWord } from '../src/mindmeldRules.js';

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
