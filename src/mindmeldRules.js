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

export function submitWord(state, userId, rawWord, now) {
  const unchanged = (result) => ({ state, result });

  if (!state.players.includes(userId)) return unchanged({ type: 'not_player' });
  if (state.status === 'won') return unchanged({ type: 'finished' });
  if (!normalizeWord(rawWord)) return unchanged({ type: 'invalid' });
  if (userId in state.pending) return unchanged({ type: 'already_submitted' });

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
