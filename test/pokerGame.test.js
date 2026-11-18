import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FLASH_MS, ANSWER_MS, WINS_NEEDED, STANDARD_ROUNDS,
  newGame, viewBoard, markHidden, submitAnswer, forfeitExpired, nextRound, isStale,
  enqueue, takeDue, nextAlarmAt,
} from '../src/pokerGame.js';

const RANK = { 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, 10: 10, J: 11, Q: 12, K: 13, A: 14 };
const card = (s) => ({ rank: RANK[s.slice(0, -1)], suit: s.slice(-1) });
const cards = (s) => s.split(' ').map(card);
// Squares C and D (2, 3) make four kings, the best pick. Squares A and B (0, 1) make two pair.
const DEAL = { board: cards('4S 4H KH KC 2D 3D 5H 9C JD QC 7S 8H 10C 6D 2S 3C'), shared: cards('KS KD 2H') };
const BEST = [2, 3];
const WEAK = [0, 1];

const A = 'a';
const B = 'b';
const T0 = 1_000_000;

const duel = () => newGame([A, B], DEAL, T0);
const solo = () => newGame([A], DEAL, T0);

// View at t, hide at t + flash. Returns the state with that player's flash finished.
function flashed(state, id, t = T0) {
  const viewed = viewBoard(state, id, t).state;
  return markHidden(viewed, id, t + FLASH_MS).state;
}

// Both players flash, then answer. Returns the final result of the second answer.
function playRound(state, aPicks, bPicks) {
  let s = flashed(flashed(state, A), B);
  s = submitAnswer(s, A, aPicks, T0 + FLASH_MS + 1000).state;
  return submitAnswer(s, B, bPicks, T0 + FLASH_MS + 2000);
}

test('constants match the design', () => {
  assert.equal(FLASH_MS, 20000);
  assert.equal(ANSWER_MS, 60000);
  assert.equal(WINS_NEEDED, 3);
  assert.equal(STANDARD_ROUNDS, 5);
});

test('a new game starts open at round 1 in duel or solo mode', () => {
  const g = duel();
  assert.equal(g.mode, 'duel');
  assert.equal(g.round, 1);
  assert.equal(g.status, 'active');
  assert.deepEqual(g.wins, { [A]: 0, [B]: 0 });
  assert.equal(solo().mode, 'solo');
});

test('viewing the board returns it with a hide time and refuses a second look', () => {
  const first = viewBoard(duel(), A, T0);
  assert.equal(first.result.type, 'ok');
  assert.deepEqual(first.result.board, DEAL.board);
  assert.equal(first.result.hideAt, T0 + FLASH_MS);
  const again = viewBoard(first.state, A, T0 + 5);
  assert.equal(again.result.type, 'already_viewed');
  assert.deepEqual(again.state, first.state);
});

test('viewing is refused for outsiders', () => {
  assert.equal(viewBoard(duel(), 'c', T0).result.type, 'not_player');
});

test('answering before looking, or while the board still shows, is refused and changes nothing', () => {
  const g = duel();
  assert.equal(submitAnswer(g, A, BEST, T0).result.type, 'not_viewed');
  const viewing = viewBoard(g, A, T0).state;
  const mid = submitAnswer(viewing, A, BEST, T0 + 5000);
  assert.equal(mid.result.type, 'still_looking');
  assert.deepEqual(mid.state, viewing);
});

test('hiding starts the answer clock once, and only for a player who has looked', () => {
  const g = duel();
  assert.equal(markHidden(g, A, T0).result.type, 'no_change');
  const viewed = viewBoard(g, A, T0).state;
  const hidden = markHidden(viewed, A, T0 + FLASH_MS);
  assert.equal(hidden.result.type, 'ok');
  assert.deepEqual(hidden.result.shared, DEAL.shared);
  assert.equal(hidden.result.deadline, T0 + FLASH_MS + ANSWER_MS);
  assert.equal(markHidden(hidden.state, A, T0 + FLASH_MS + 10).result.type, 'no_change');
});

test('the first answer waits and a repeat answer is refused', () => {
  const s = flashed(duel(), A);
  const first = submitAnswer(s, A, BEST, T0 + FLASH_MS + 1000);
  assert.equal(first.result.type, 'waiting');
  assert.equal(submitAnswer(first.state, A, WEAK, T0 + FLASH_MS + 2000).result.type, 'already_answered');
});

test('a duel round resolves when both have answered, and the stronger hand wins it', () => {
  const { state, result } = playRound(duel(), BEST, WEAK);
  assert.equal(result.type, 'resolved');
  const r = result.roundResult;
  assert.equal(r.outcome, 'win');
  assert.equal(r.winner, A);
  assert.deepEqual(r.wins, { [A]: 1, [B]: 0 });
  assert.deepEqual(r.picks, { [A]: BEST, [B]: WEAK });
  assert.equal(r.hands[A].category, 7);
  assert.equal(r.hands[B].category, 2);
  assert.equal(r.finished, false);
  assert.equal(state.roundOpen, false);
  assert.equal(viewBoard(state, A, T0).result.type, 'round_over');
  assert.equal(submitAnswer(state, A, BEST, T0).result.type, 'round_over');
});

test('equal hands draw and neither player scores', () => {
  const { result } = playRound(duel(), WEAK, WEAK);
  assert.equal(result.roundResult.outcome, 'draw');
  assert.equal(result.roundResult.winner, null);
  assert.deepEqual(result.roundResult.wins, { [A]: 0, [B]: 0 });
});

test('both players may pick the same squares', () => {
  const { result } = playRound(duel(), BEST, BEST);
  assert.equal(result.roundResult.outcome, 'draw');
});

test('an answer exactly at the deadline counts, one millisecond later forfeits', () => {
  const s = flashed(duel(), A);
  const deadline = T0 + FLASH_MS + ANSWER_MS;
  assert.equal(submitAnswer(s, A, BEST, deadline).result.type, 'waiting');
  const late = submitAnswer(s, A, BEST, deadline + 1);
  assert.equal(late.result.type, 'late');
  assert.equal(late.state.per[A].forfeited, true);
  assert.equal(late.state.per[A].answer, null);
  assert.equal(submitAnswer(late.state, A, BEST, deadline + 2).result.type, 'late');
});

test('a late answer that closes the round resolves it for the other player', () => {
  let s = flashed(flashed(duel(), A), B);
  s = submitAnswer(s, B, WEAK, T0 + FLASH_MS + 1000).state;
  const late = submitAnswer(s, A, BEST, T0 + FLASH_MS + ANSWER_MS + 1);
  assert.equal(late.result.type, 'late');
  assert.equal(late.result.roundResult.winner, B);
  assert.deepEqual(late.result.roundResult.forfeited, [A]);
  assert.equal(late.result.roundResult.hands[A], null);
});

test('forfeitExpired forfeits only viewed players past their deadline with no answer', () => {
  let s = flashed(flashed(duel(), A), B);
  s = submitAnswer(s, B, WEAK, T0 + FLASH_MS + 1000).state;
  const early = forfeitExpired(s, T0 + FLASH_MS + ANSWER_MS);
  assert.equal(early.resolved, null);
  assert.equal(early.state.per[A].forfeited, false);
  const after = forfeitExpired(s, T0 + FLASH_MS + ANSWER_MS + 1);
  assert.equal(after.resolved.winner, B);
  assert.deepEqual(after.resolved.forfeited, [A]);
  assert.equal(forfeitExpired(after.state, T0 + FLASH_MS + ANSWER_MS + 5).resolved, null);
});

test('both players forfeiting is a draw', () => {
  const s = flashed(flashed(duel(), A), B);
  const { resolved } = forfeitExpired(s, T0 + FLASH_MS + ANSWER_MS + 1);
  assert.equal(resolved.outcome, 'draw');
  assert.deepEqual(resolved.forfeited.sort(), [A, B]);
});

test('a player who never looked has no clock, so the round stays open for them', () => {
  const s = flashed(duel(), A);
  const { resolved, state } = forfeitExpired(s, T0 + 10 * ANSWER_MS);
  assert.equal(resolved, null);
  assert.equal(state.per[A].forfeited, true);
  assert.equal(state.per[B].forfeited, false);
  assert.equal(state.roundOpen, true);
});

// A match played with the same deal every round: 'a' = A wins, 'b' = B wins, 'd' = draw.
function playMatch(spec) {
  let state = duel();
  let last;
  spec.split('').forEach((c, i) => {
    if (i > 0) state = nextRound(state, DEAL, T0).state;
    const picks = { a: [BEST, WEAK], b: [WEAK, BEST], d: [WEAK, WEAK] }[c];
    const out = playRound(state, ...picks);
    state = out.state;
    last = out.result.roundResult;
  });
  return { state, last };
}

test('first to three round wins takes the match', () => {
  const { state, last } = playMatch('aab' + 'a');
  assert.equal(last.round, 4);
  assert.equal(last.finished, true);
  assert.equal(last.matchWinner, A);
  assert.equal(state.status, 'finished');
});

test('nobody is finished mid-match while the score is short of three', () => {
  const { last } = playMatch('abab');
  assert.equal(last.finished, false);
  assert.equal(last.matchWinner, null);
});

test('after round five the leader wins even short of three wins', () => {
  assert.equal(playMatch('adbda').last.finished, true);
  assert.equal(playMatch('adbda').last.matchWinner, A);
  assert.equal(playMatch('adbd').last.finished, false);
});

test('level after round five plays on until a round leaves someone ahead', () => {
  assert.equal(playMatch('abddd').last.finished, false);
  const next = playMatch('abddd' + 'b');
  assert.equal(next.last.round, 6);
  assert.equal(next.last.finished, true);
  assert.equal(next.last.matchWinner, B);
  assert.equal(playMatch('ddddd' + 'd').last.finished, false);
});

test('drawn rounds count for neither player and do not bring a win closer', () => {
  const four = playMatch('ddd' + 'a').last;
  assert.equal(four.finished, false);
  assert.deepEqual(four.wins, { [A]: 1, [B]: 0 });
  const five = playMatch('ddd' + 'aa').last;
  assert.equal(five.round, 5);
  assert.equal(five.finished, true);
  assert.equal(five.matchWinner, A);
});

test('nextRound is refused while a round is open and after the match, and resets per-round data', () => {
  assert.equal(nextRound(duel(), DEAL, T0).result.type, 'round_open');
  const done = playRound(duel(), BEST, WEAK).state;
  const next = nextRound(done, DEAL, T0 + 99);
  assert.equal(next.result.type, 'ok');
  assert.equal(next.state.round, 2);
  assert.equal(next.state.roundOpen, true);
  assert.equal(next.state.per[A].viewedAt, null);
  assert.equal(next.state.per[A].answer, null);
  assert.deepEqual(next.state.wins, { [A]: 1, [B]: 0 });
  const finished = playMatch('aaa').state;
  assert.equal(nextRound(finished, DEAL, T0).result.type, 'finished');
});

test('solo resolves on the single answer and reports whether the best hand was found', () => {
  let s = flashed(solo(), A);
  const found = submitAnswer(s, A, BEST, T0 + FLASH_MS + 1000);
  const r = found.result.roundResult;
  assert.equal(found.result.type, 'resolved');
  assert.equal(r.outcome, 'solo');
  assert.equal(r.finished, false);
  assert.equal(r.analysis.found, true);
  assert.deepEqual(r.analysis.best.picks, BEST);
  assert.equal(r.analysis.total, 120);
  assert.equal(r.analysis.beaten, 119);
  assert.equal(found.state.status, 'active');

  const miss = submitAnswer(s, A, WEAK, T0 + FLASH_MS + 1000).result.roundResult;
  assert.equal(miss.analysis.found, false);
  assert.deepEqual(miss.analysis.best.picks, BEST);
  assert.deepEqual(miss.analysis.yours.picks, WEAK);
  assert.ok(miss.analysis.beaten > 0 && miss.analysis.beaten < 119);
});

test('solo picking different squares that tie the best hand still counts as found', () => {
  // AH on the board makes four aces with the shared aces; KH and KC give the same kicker.
  const tied = {
    board: cards('AH KH KC 2D 3D 4C 6C 7C 8C 9D 10D JD QD 5H 5C 5D'),
    shared: cards('AS AD AC'),
  };
  const s = flashed(newGame([A], tied, T0), A);
  const out = submitAnswer(s, A, [0, 2], T0 + FLASH_MS + 1);
  const { analysis } = out.result.roundResult;
  assert.deepEqual(analysis.best.picks, [0, 1]);
  assert.deepEqual(analysis.yours.picks, [0, 2]);
  assert.equal(analysis.found, true);
});

test('solo forfeit ends the board with no analysis, and a new board can follow', () => {
  const s = flashed(solo(), A);
  const { resolved, state } = forfeitExpired(s, T0 + FLASH_MS + ANSWER_MS + 1);
  assert.deepEqual(resolved.forfeited, [A]);
  assert.equal(resolved.analysis, null);
  assert.equal(nextRound(state, DEAL, T0).result.type, 'ok');
});

test('a stale round number is detected', () => {
  const g = duel();
  assert.equal(isStale(g, 1), false);
  assert.equal(isStale(g, 2), true);
});

test('state functions do not mutate the state they are given', () => {
  const s = flashed(duel(), A);
  const before = JSON.stringify(s);
  submitAnswer(s, A, BEST, T0 + FLASH_MS + 1);
  viewBoard(s, B, T0);
  forfeitExpired(s, T0 + FLASH_MS + ANSWER_MS + 5);
  assert.equal(JSON.stringify(s), before);
});

test('queue helpers keep items, split the due ones and find the next alarm', () => {
  let q = [];
  q = enqueue(q, { at: 300, type: 'deadline' });
  q = enqueue(q, { at: 100, type: 'hide' });
  q = enqueue(q, { at: 200, type: 'hide' });
  const { due, rest } = takeDue(q, 200);
  assert.deepEqual(due.map((i) => i.at), [100, 200]);
  assert.deepEqual(rest.map((i) => i.at), [300]);
  assert.equal(nextAlarmAt(rest, 9000), 300);
  assert.equal(nextAlarmAt([], 9000), 9000);
  assert.equal(nextAlarmAt(q, 50), 50);
});
