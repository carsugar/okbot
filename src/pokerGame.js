// Memory Poker game state machine. Pure: every function takes a state and returns a new one,
// so it runs in plain node. `now` is epoch milliseconds, passed in.
import { handFor, compareHands, bestHand, countBeaten } from './pokerRules.js';

export const FLASH_MS = 20_000;
export const ANSWER_MS = 30_000;
export const WINS_NEEDED = 3;
export const STANDARD_ROUNDS = 5;

const blank = () => ({ viewedAt: null, hiddenAt: null, deadline: null, answer: null, forfeited: false });
const perPlayer = (players, make) => Object.fromEntries(players.map((id) => [id, make()]));
const setPer = (state, id, patch) => ({ ...state.per, [id]: { ...state.per[id], ...patch } });
const touch = (state, patch, now) => ({ ...state, ...patch, updatedAt: now });
const isDone = (p) => p.answer !== null || p.forfeited;
const allDone = (state) => state.players.every((id) => isDone(state.per[id]));
const closedReason = (state) => (state.status === 'finished' ? 'finished' : state.roundOpen ? null : 'round_over');
const refuse = (state, type) => ({ state, result: { type } });

export function newGame(players, deal, now) {
  return {
    mode: players.length === 1 ? 'solo' : 'duel',
    players,
    round: 1,
    deal,
    wins: perPlayer(players, () => 0),
    status: 'active',
    roundOpen: true,
    per: perPlayer(players, blank),
    lastResult: null,
    updatedAt: now,
  };
}

export const isStale = (state, round) => state.round !== round;

export function viewBoard(state, userId, now) {
  if (!state.players.includes(userId)) return refuse(state, 'not_player');
  const closed = closedReason(state);
  if (closed) return refuse(state, closed);
  if (state.per[userId].viewedAt !== null) return refuse(state, 'already_viewed');
  return {
    state: touch(state, { per: setPer(state, userId, { viewedAt: now }) }, now),
    result: { type: 'ok', board: state.deal.board, hideAt: now + FLASH_MS },
  };
}

// Called when the flash ends. Starts that player's answer clock.
export function markHidden(state, userId, now) {
  const p = state.per[userId];
  if (!state.roundOpen || !p || p.viewedAt === null || p.hiddenAt !== null) return refuse(state, 'no_change');
  const deadline = now + ANSWER_MS;
  return {
    state: touch(state, { per: setPer(state, userId, { hiddenAt: now, deadline }) }, now),
    result: { type: 'ok', shared: state.deal.shared, deadline },
  };
}

function analyse(deal, picks) {
  const best = bestHand(deal);
  const yours = { picks, hand: handFor(deal, picks) };
  return {
    found: compareHands(yours.hand, best.hand) === 0,
    best,
    yours,
    beaten: countBeaten(deal, yours.hand),
    total: 120,
  };
}

// Every player has answered or forfeited: score the round and decide whether the match is over.
function resolveRound(state, now) {
  const { players, deal } = state;
  const picks = {};
  const hands = {};
  const forfeited = [];
  for (const id of players) {
    const p = state.per[id];
    picks[id] = p.answer;
    hands[id] = p.answer ? handFor(deal, p.answer) : null;
    if (p.forfeited) forfeited.push(id);
  }

  const wins = { ...state.wins };
  let outcome = 'solo';
  let winner = null;
  let matchWinner = null;
  let analysis = null;
  if (state.mode === 'solo') {
    if (picks[players[0]]) analysis = analyse(deal, picks[players[0]]);
  } else {
    const [a, b] = players;
    const cmp = hands[a] && hands[b] ? compareHands(hands[a], hands[b]) : hands[a] ? 1 : hands[b] ? -1 : 0;
    outcome = cmp === 0 ? 'draw' : 'win';
    winner = cmp > 0 ? a : cmp < 0 ? b : null;
    if (winner) wins[winner] += 1;
    if (wins[a] >= WINS_NEEDED) matchWinner = a;
    else if (wins[b] >= WINS_NEEDED) matchWinner = b;
    else if (state.round >= STANDARD_ROUNDS && wins[a] !== wins[b]) matchWinner = wins[a] > wins[b] ? a : b;
  }

  const roundResult = {
    round: state.round, outcome, winner, hands, picks, forfeited, wins,
    finished: matchWinner !== null, matchWinner, analysis,
  };
  return {
    state: touch(state, { wins, roundOpen: false, status: matchWinner ? 'finished' : 'active', lastResult: roundResult }, now),
    roundResult,
  };
}

function closeIfDone(state, now, type) {
  if (!allDone(state)) return { state, result: { type } };
  const resolved = resolveRound(state, now);
  return { state: resolved.state, result: { type, roundResult: resolved.roundResult } };
}

export function submitAnswer(state, userId, picks, now) {
  if (!state.players.includes(userId)) return refuse(state, 'not_player');
  const closed = closedReason(state);
  if (closed) return refuse(state, closed);
  const p = state.per[userId];
  if (p.viewedAt === null) return refuse(state, 'not_viewed');
  if (p.answer !== null) return refuse(state, 'already_answered');
  if (p.forfeited) return refuse(state, 'late');
  if (p.hiddenAt === null) return refuse(state, 'still_looking');

  if (now > p.deadline) {
    const forfeited = touch(state, { per: setPer(state, userId, { forfeited: true }) }, now);
    return closeIfDone(forfeited, now, 'late');
  }
  const answered = touch(state, { per: setPer(state, userId, { answer: picks }) }, now);
  const out = closeIfDone(answered, now, 'waiting');
  return out.result.roundResult ? { state: out.state, result: { type: 'resolved', roundResult: out.result.roundResult } } : out;
}

// Forfeit anyone whose answer window has passed. `resolved` is the round result if that ended the round.
export function forfeitExpired(state, now) {
  if (!state.roundOpen) return { state, resolved: null };
  let per = state.per;
  for (const id of state.players) {
    const p = per[id];
    if (p.deadline !== null && now > p.deadline && p.answer === null && !p.forfeited) {
      per = { ...per, [id]: { ...p, forfeited: true } };
    }
  }
  if (per === state.per) return { state, resolved: null };
  const next = touch(state, { per }, now);
  if (!allDone(next)) return { state: next, resolved: null };
  const resolved = resolveRound(next, now);
  return { state: resolved.state, resolved: resolved.roundResult };
}

export function nextRound(state, deal, now) {
  if (state.status === 'finished') return refuse(state, 'finished');
  if (state.roundOpen) return refuse(state, 'round_open');
  return {
    state: touch(state, {
      round: state.round + 1, deal, roundOpen: true, per: perPlayer(state.players, blank), lastResult: null,
    }, now),
    result: { type: 'ok' },
  };
}

// ── Timed work ────────────────────────────────────────────────────────────────

export const enqueue = (queue, item) => [...queue, item];

export function takeDue(queue, now) {
  const due = queue.filter((i) => i.at <= now).sort((a, b) => a.at - b.at);
  return { due, rest: queue.filter((i) => i.at > now) };
}

export const nextAlarmAt = (queue, expiryAt) => Math.min(expiryAt, ...queue.map((i) => i.at));
