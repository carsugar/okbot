import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newLobby, claim, setBestOf, LOBBY_MS } from '../src/pokerLobby.js';

const [A, B, C] = ['u1', 'u2', 'u3'];

test('the lobby lasts one minute and starts with both spots open', () => {
  assert.equal(LOBBY_MS, 60_000);
  assert.deepEqual(newLobby().spots, [null, null]);
});

test('claiming an open spot takes it', () => {
  const { lobby, result } = claim(newLobby(), A, 0);
  assert.deepEqual(lobby.spots, [A, null]);
  assert.equal(result.type, 'joined');
});

test('claiming the second spot fills the lobby', () => {
  const one = claim(newLobby(), A, 0).lobby;
  const { lobby, result } = claim(one, B, 1);
  assert.deepEqual(lobby.spots, [A, B]);
  assert.equal(result.type, 'full');
});

test('a taken spot is refused and nothing changes', () => {
  const one = claim(newLobby(), A, 0).lobby;
  const { lobby, result } = claim(one, B, 0);
  assert.equal(result.type, 'taken');
  assert.deepEqual(lobby, one);
});

test('nobody can hold both spots: the other button is refused', () => {
  const one = claim(newLobby(), A, 0).lobby;
  const { lobby, result } = claim(one, A, 1);
  assert.equal(result.type, 'already_in');
  assert.equal(result.spot, 0);
  assert.deepEqual(lobby, one);
});

test('pressing your own spot again gives it up so someone else can take it', () => {
  const one = claim(newLobby(), A, 0).lobby;
  const left = claim(one, A, 0);
  assert.equal(left.result.type, 'left');
  assert.deepEqual(left.lobby.spots, [null, null]);
  assert.equal(claim(left.lobby, C, 0).result.type, 'joined');
});

test('either player can take either spot, in either order', () => {
  const first = claim(newLobby(), B, 1).lobby;
  const { lobby, result } = claim(first, A, 0);
  assert.equal(result.type, 'full');
  assert.deepEqual(lobby.spots, [A, B]);
});

test('a new lobby is a single round, and only 1, 3 or 5 can be picked', () => {
  assert.equal(newLobby().bestOf, 1);
  assert.equal(setBestOf(newLobby(), 3).bestOf, 3);
  assert.equal(setBestOf(newLobby(), 4).bestOf, 1);
});

test('joining keeps the chosen match length', () => {
  assert.equal(claim(setBestOf(newLobby(), 5), A, 0).lobby.bestOf, 5);
});
