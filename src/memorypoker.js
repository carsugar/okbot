import { DurableObject } from 'cloudflare:workers';
import { JsonResponse } from './utils.js';
import { SQUARES, deal } from './pokerRules.js';
import {
  newGame, viewBoard, markHidden, placeMarker, lockIn, forfeitExpired, nextRound, isStale,
  enqueue, takeDue, nextAlarmAt, FLASH_MS,
} from './pokerGame.js';
import { newLobby, claim, LOBBY_MS } from './pokerLobby.js';
import {
  lobbyComponents, lobbyClosedComponents, countdownComponents, lockStatus, boardComponents, hiddenComponents,
  roundComponents, pickerComponents, parseId,
} from './memoryPokerMessages.js';

const EXPIRY_MS = 24 * 60 * 60 * 1000;
const EPHEMERAL = 64;
const COMPONENTS_V2 = 1 << 15;
const COUNTDOWN_FROM = 5;
const DISCORD_API = 'https://discord.com/api/v10';

const randomDeal = () => deal(() => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32);
const seconds = (ms) => Math.floor(ms / 1000);
const text = (content) => ({ type: 10, content });

// The countdown after a round starts: 5 is shown straight away, then 4, 3, 2, 1, and the board.
const countdownQueue = (now) => [
  ...Array.from({ length: COUNTDOWN_FROM - 1 }, (_, i) => ({ at: now + (i + 1) * 1000, type: 'tick', n: COUNTDOWN_FROM - 1 - i })),
  { at: now + COUNTDOWN_FROM * 1000, type: 'flash' },
];

// ── Durable Object: one per game ──────────────────────────────────────────────
//
// The round plays out in one public message that this object edits on a timer with the
// token of the interaction that started the round (valid for 15 minutes). Each player also
// gets a private picker, sent automatically when the cards flip, using the token from the
// button they pressed to join (or to get ready for the round).

export class MemoryPokerGame extends DurableObject {
  async #load() {
    const stored = await this.ctx.storage.get(['state', 'queue', 'meta', 'lobby', 'live']);
    return {
      state: stored.get('state'), queue: stored.get('queue') ?? [], meta: stored.get('meta'),
      lobby: stored.get('lobby'), live: stored.get('live'),
    };
  }

  async #save(state, queue) {
    await this.ctx.storage.put({ state, queue });
    await this.ctx.storage.setAlarm(nextAlarmAt(queue, state.updatedAt + EXPIRY_MS));
  }

  // A fresh round: save it with the countdown scheduled. `token` edits the public message and
  // `tokens` (player id to token) are what each private picker is sent with.
  async #startRound(state, token, tokens, now) {
    await this.ctx.storage.put({ live: { token }, tokens });
    await this.ctx.storage.delete('pickers');
    await this.#save(state, countdownQueue(now));
  }

  async openLobby(gameId, origin, appId, token) {
    const now = Date.now();
    const queue = [{ at: now + LOBBY_MS, type: 'lobby_expire', token }];
    await this.ctx.storage.put({ meta: { gameId, origin, appId, closesAt: now + LOBBY_MS }, lobby: newLobby(), lobbyTokens: {}, queue });
    await this.ctx.storage.setAlarm(now + LOBBY_MS);
    return { closesAt: now + LOBBY_MS };
  }

  async join(userId, spot, token) {
    const { lobby, state, meta } = await this.#load();
    if (!lobby) return { type: state ? 'started' : 'expired' };
    const out = claim(lobby, userId, spot);
    if (out.result.type === 'taken' || out.result.type === 'already_in') return out.result;

    const tokens = (await this.ctx.storage.get('lobbyTokens')) ?? {};
    if (out.result.type === 'left') delete tokens[userId];
    else tokens[userId] = token;
    if (out.result.type !== 'full') {
      await this.ctx.storage.put({ lobby: out.lobby, lobbyTokens: tokens });
      return { type: 'updated', spots: out.lobby.spots, closesAt: meta.closesAt };
    }
    const now = Date.now();
    const game = newGame(out.lobby.spots, randomDeal(), now);
    await this.ctx.storage.delete(['lobby', 'lobbyTokens']);
    await this.#startRound(game, token, tokens, now);
    return { type: 'started', players: game.players, wins: game.wins };
  }

  async startSolo(userId, gameId, origin, appId, token) {
    const now = Date.now();
    await this.ctx.storage.put('meta', { gameId, origin, appId });
    await this.#startRound(newGame([userId], randomDeal(), now), token, { [userId]: token }, now);
  }

  // A press on a square of a player's private grid places or removes a marker; an empty `letter`
  // is Lock in. Returns the grid to show them.
  async mark(userId, round, letter) {
    const { state, queue, meta, live } = await this.#load();
    if (!state) return { type: 'expired' };
    if (isStale(state, round)) return { type: 'stale' };
    const out = letter ? placeMarker(state, userId, SQUARES.indexOf(letter), Date.now()) : lockIn(state, userId, Date.now());
    const type = out.result.type;
    const resolved = out.result.roundResult;
    if (out.state !== state) {
      // A resolved round has no answer windows left to police.
      await this.#save(out.state, resolved ? queue.filter((i) => i.type !== 'deadline') : queue);
    }
    if (!['marked', 'need_two', 'waiting', 'resolved'].includes(type)) return { type };

    if (type === 'waiting' || resolved) {
      // The public message shows who has locked in, or the result.
      const components = resolved ? this.#resultParts(meta, out.state, resolved) : this.#hiddenParts(meta, out.state);
      await this.#patch(live?.token, components, meta.appId);
    }
    // Once the round is decided, the other player's private grid becomes a short note.
    if (resolved) await this.#closePickers(meta, out.state, userId);
    return { type, view: this.#pickerView(meta, out.state, userId) };
  }

  // The result message has a Ready button. In a duel both players press it, and then the next
  // round counts down; each press also gives the bot a fresh token for that player's picker.
  async next(userId, round, token) {
    const { state, meta } = await this.#load();
    if (!state) return { type: 'expired' };
    if (isStale(state, round)) return { type: 'stale' };
    if (!state.players.includes(userId)) return { type: 'not_player' };
    if (state.status === 'finished') return { type: 'finished' };
    if (state.roundOpen) return { type: 'round_open' };

    const ready = (await this.ctx.storage.get('ready')) ?? {};
    ready[userId] = token;
    if (Object.keys(ready).length < state.players.length) {
      await this.ctx.storage.put('ready', ready);
      return { type: 'waiting', components: this.#resultParts(meta, state, state.lastResult, Object.keys(ready)) };
    }
    const now = Date.now();
    const out = nextRound(state, randomDeal(), now);
    if (out.result.type !== 'ok') return out.result;
    await this.ctx.storage.delete('ready');
    await this.#startRound(out.state, token, ready, now);
    return { type: 'ok', players: out.state.players, round: out.state.round, wins: out.state.wins };
  }

  async alarm() {
    const { state, queue, meta, lobby, live } = await this.#load();
    const now = Date.now();
    if (!state) {
      // Still in the lobby: close it if its minute is up.
      const item = queue.find((i) => i.type === 'lobby_expire');
      if (item && lobby && now >= item.at) await this.#patch(item.token, lobbyClosedComponents(), meta.appId);
      if (!lobby || (item && now >= item.at)) await this.ctx.storage.deleteAll();
      return;
    }
    if (now >= state.updatedAt + EXPIRY_MS) {
      await this.ctx.storage.deleteAll();
      return;
    }

    // Decide everything and save it first. Network calls let other requests run, so saving
    // afterwards would overwrite an answer that arrived in the meantime.
    let { due, rest: pending } = takeDue(queue, now);
    // If the alarm ran late, skip countdown numbers that are already over.
    if (due.some((i) => i.type === 'flash')) due = due.filter((i) => i.type !== 'tick');
    let current = state;
    const edits = [];
    let openPickers = false;
    let closePickers = false;
    for (const item of due) {
      if (item.type === 'tick') {
        edits.push(countdownComponents(item.n, current.players, current.round, current.wins));
      } else if (item.type === 'flash') {
        for (const id of current.players) current = viewBoard(current, id, now).state;
        const hideAt = now + FLASH_MS;
        pending = enqueue(pending, { at: hideAt, type: 'hide' });
        edits.push(boardComponents(current.deal.board, seconds(hideAt), meta.origin));
      } else if (item.type === 'hide') {
        for (const id of current.players) current = markHidden(current, id, now).state;
        const deadline = current.per[current.players[0]].deadline;
        if (deadline === null) continue;
        // One millisecond past the deadline, because an answer exactly at the deadline still counts.
        pending = enqueue(pending, { at: deadline + 1, type: 'deadline' });
        edits.push(this.#hiddenParts(meta, current));
        openPickers = true;
      } else if (item.type === 'deadline') {
        const out = forfeitExpired(current, now);
        current = out.state;
        if (!out.resolved) continue;
        pending = pending.filter((i) => i.type !== 'deadline');
        edits.push(this.#resultParts(meta, current, out.resolved));
        closePickers = true;
      }
    }
    await this.#save(current, pending);
    for (const components of edits) await this.#patch(live?.token, components, meta.appId);
    if (openPickers) await this.#openPickers(meta, current);
    if (closePickers) await this.#closePickers(meta, current, null);
  }

  // Send each player their private picker, with the token they pressed a button with.
  async #openPickers(meta, state) {
    const tokens = (await this.ctx.storage.get('tokens')) ?? {};
    const pickers = {};
    for (const id of state.players) {
      if (!tokens[id]) continue;
      const message = await this.#post(tokens[id], this.#pickerView(meta, state, id), meta.appId);
      if (message?.id) pickers[id] = { messageId: message.id, token: tokens[id] };
    }
    await this.ctx.storage.put('pickers', pickers);
  }

  async #closePickers(meta, state, exceptUserId) {
    const pickers = (await this.ctx.storage.get('pickers')) ?? {};
    for (const [id, picker] of Object.entries(pickers)) {
      if (id !== exceptUserId) await this.#patch(picker.token, this.#pickerView(meta, state, id), meta.appId, picker.messageId);
    }
  }

  // The private grid for one player right now: the grid, or a note once they are done.
  #pickerView(meta, state, userId) {
    const p = state.per[userId];
    if (!state.roundOpen) return [text('This round is over. The result is in the message above.')];
    if (p.answer) return [text(`Locked in **${p.answer.map((i) => SQUARES[i]).join(' + ')}**. Waiting for your opponent.`)];
    if (p.forfeited) return [text('Time ran out for this round.')];
    const markers = p.markers.map((i) => SQUARES[i]).join('');
    return pickerComponents(meta.gameId, state.round, seconds(p.deadline), markers);
  }

  #hiddenParts(meta, state) {
    const deadline = state.per[state.players[0]].deadline;
    return hiddenComponents(state.deal.shared, seconds(deadline), meta.origin, lockStatus(state.players, state.per));
  }

  #resultParts(meta, state, result, ready = []) {
    return roundComponents(state.players, result, state.deal, meta.origin, meta.gameId, ready);
  }

  // Discord calls. Interaction tokens last 15 minutes, far longer than a round.
  async #discord(method, token, path, components, appId, extra = {}) {
    // Games started before the live flow have no token to edit with.
    if (!token || !appId) return null;
    try {
      const api = this.env.DISCORD_API ?? DISCORD_API;
      const res = await fetch(`${api}/webhooks/${appId}/${token}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ components, allowed_mentions: { parse: [] }, ...extra }),
      });
      return res.ok ? await res.json() : null;
    } catch {
      // The message stays as it was; the next timed step still runs.
      return null;
    }
  }

  #patch(token, components, appId, messageId = '@original') {
    return this.#discord('PATCH', token, `/messages/${messageId}`, components, appId, { flags: COMPONENTS_V2 });
  }

  #post(token, components, appId) {
    return this.#discord('POST', token, '?wait=true', components, appId, { flags: COMPONENTS_V2 | EPHEMERAL });
  }
}

// ── Responses ─────────────────────────────────────────────────────────────────

const REFUSALS = {
  expired: 'This game expired. Start a new one with `/memorypoker`.',
  started: 'This game has already started.',
  stale: 'That button is out of date. Use the latest one.',
  not_player: 'This is not your game.',
  finished: 'This match is over. Start a new one with `/memorypoker`.',
  round_open: 'This round is still being played.',
  not_viewed: 'The board has not been shown yet.',
  still_looking: 'Wait until the board is hidden.',
  taken: 'That spot is taken.',
};

const ephemeral = (content) => new JsonResponse({ type: 4, data: { content, flags: EPHEMERAL } });
const refusal = (type) => ephemeral(REFUSALS[type] ?? 'Something went wrong. Start a new game with `/memorypoker`.');
// Messages made only of components, so the card pictures can be shown.
const componentsMessage = (components, flags = 0) =>
  new JsonResponse({ type: 4, data: { components, flags: COMPONENTS_V2 | flags, allowed_mentions: { parse: [] } } });
const updateMessage = (components) =>
  new JsonResponse({ type: 7, data: { components, flags: COMPONENTS_V2, allowed_mentions: { parse: [] } } });

const gameStub = (env, gameId) => env.MEMORY_POKER.get(env.MEMORY_POKER.idFromName(gameId));

// ── Handlers ──────────────────────────────────────────────────────────────────

export async function handleMemoryPokerCommand(interaction, env, origin) {
  const userId = interaction.member.user.id;
  const solo = interaction.data.options?.find((o) => o.name === 'solo')?.value === true;
  const gameId = interaction.id;
  const appId = interaction.application_id ?? env.DISCORD_APPLICATION_ID;
  const stub = gameStub(env, gameId);

  if (solo) {
    // Practice stays private, and starts counting down straight away.
    await stub.startSolo(userId, gameId, origin, appId, interaction.token);
    return componentsMessage(countdownComponents(COUNTDOWN_FROM, [userId], 1, { [userId]: 0 }), EPHEMERAL);
  }
  const { closesAt } = await stub.openLobby(gameId, origin, appId, interaction.token);
  return componentsMessage(lobbyComponents(gameId, [null, null], seconds(closesAt)));
}

export async function handleMemoryPokerComponent(interaction, env, origin) {
  const userId = interaction.member.user.id;
  const { action, gameId, round, letter } = parseId(interaction.data.custom_id);
  const stub = gameStub(env, gameId);

  if (action === 'join') {
    const spot = round; // join buttons carry their spot where other ids carry the round
    const result = await stub.join(userId, spot, interaction.token);
    if (result.type === 'already_in') return ephemeral(`You are already Player ${result.spot + 1}. Press your own button again to give the spot up.`);
    if (result.type === 'updated') return updateMessage(lobbyComponents(gameId, result.spots, seconds(result.closesAt)));
    if (result.type === 'started') return updateMessage(countdownComponents(COUNTDOWN_FROM, result.players, 1, result.wins));
    return refusal(result.type);
  }

  if (action === 'ppick' || action === 'plock') {
    const result = await stub.mark(userId, round, action === 'plock' ? '' : letter);
    // The grid is edited in place, so a press never adds a message.
    if (result.view) return updateMessage(result.view);
    // A player who is already done just presses on quietly.
    if (['already_answered', 'round_over', 'late', 'finished'].includes(result.type)) return new JsonResponse({ type: 6 });
    return refusal(result.type);
  }

  if (action === 'next') {
    const result = await stub.next(userId, round, interaction.token);
    if (result.type === 'waiting') return updateMessage(result.components);
    if (result.type !== 'ok') return refusal(result.type);
    return updateMessage(countdownComponents(COUNTDOWN_FROM, result.players, result.round, result.wins));
  }

  return ephemeral('Unknown button.');
}
