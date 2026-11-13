import lem from 'wink-lemmatizer';

const MAX_WORD_LENGTH = 32;

export function normalizeWord(raw) {
  const word = raw.trim().toLowerCase();
  if (!word || /\s/.test(word) || word.length > MAX_WORD_LENGTH) return null;
  return word;
}

const lemmas = (w) => new Set([lem.noun(w), lem.verb(w), lem.adjective(w)]);

export function wordsMatch(a, b) {
  const other = lemmas(b);
  return [...lemmas(a)].some((l) => other.has(l));
}

export function newGame(players, now) {
  return { players, pending: {}, history: [], status: 'active', updatedAt: now };
}

const closedStatus = (state) => (state.status === 'won' ? 'finished' : state.status === 'ended' ? 'ended' : null);

// Everything that can refuse a word before it is locked in. Only revealed words
// count as repeats, so a partner's hidden word is never leaked.
export function preflight(state, userId, rawWord) {
  if (!state.players.includes(userId)) return { type: 'not_player' };
  const closed = closedStatus(state);
  if (closed) return { type: closed };
  const word = normalizeWord(rawWord);
  if (!word) return { type: 'invalid' };
  if (userId in state.pending) return { type: 'already_submitted' };
  const seen = state.history.flatMap((round) => Object.values(round));
  if (seen.some((old) => wordsMatch(word, normalizeWord(old)))) return { type: 'repeat' };
  return { type: 'ok' };
}

export function endGame(state, userId, now) {
  if (!state.players.includes(userId)) return { state, result: { type: 'not_player' } };
  const closed = closedStatus(state);
  if (closed) return { state, result: { type: closed } };
  return {
    state: { ...state, status: 'ended', updatedAt: now },
    result: { type: 'ended_now', rounds: state.history.length },
  };
}

export function submitWord(state, userId, rawWord, now) {
  const check = preflight(state, userId, rawWord);
  if (check.type !== 'ok') return { state, result: check };

  const pending = { ...state.pending, [userId]: rawWord.trim() };
  const next = { ...state, pending, updatedAt: now };
  if (Object.keys(pending).length < 2) return { state: next, result: { type: 'waiting' } };

  const [a, b] = state.players;
  const [wa, wb] = [normalizeWord(pending[a]), normalizeWord(pending[b])];
  const matched = wordsMatch(wa, wb);
  const history = [...state.history, pending];
  return {
    state: { ...next, pending: {}, history, status: matched ? 'won' : 'active' },
    result: { type: 'revealed', round: history.length, words: pending, matched, exact: matched && wa === wb },
  };
}
