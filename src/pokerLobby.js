// The Memory Poker lobby: two spots that players claim with buttons. Pure.
export const LOBBY_MS = 60_000;

export const newLobby = () => ({ spots: [null, null] });

// Press a spot's button. Pressing your own spot again gives it up; nobody holds both.
export function claim(lobby, userId, spot) {
  const held = lobby.spots.indexOf(userId);
  const set = (value) => ({ spots: lobby.spots.map((s, i) => (i === spot ? value : s)) });
  if (held === spot) return { lobby: set(null), result: { type: 'left' } };
  if (held !== -1) return { lobby, result: { type: 'already_in', spot: held } };
  if (lobby.spots[spot] !== null) return { lobby, result: { type: 'taken' } };
  const next = set(userId);
  return { lobby: next, result: { type: next.spots.every(Boolean) ? 'full' : 'joined' } };
}
