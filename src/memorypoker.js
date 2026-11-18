import { DurableObject } from 'cloudflare:workers';
import { JsonResponse } from './utils.js';
import { SQUARES, deal, parseAnswer } from './pokerRules.js';
import {
  newGame, viewBoard, markHidden, submitAnswer, forfeitExpired, nextRound, isStale,
  enqueue, takeDue, nextAlarmAt, FLASH_MS,
} from './pokerGame.js';
import { newLobby, claim, LOBBY_MS } from './pokerLobby.js';
import {
  lobbyComponents, lobbyClosedComponents, countdownComponents, lockStatus, boardComponents, hiddenComponents,
  pickerComponents, openRow, roundComponents, pickerRows, joinId, nextId, parseId,
} from './memoryPokerMessages.js';

const EXPIRY_MS = 24 * 60 * 60 * 1000;
const EPHEMERAL = 64;
const COMPONENTS_V2 = 1 << 15;
const COUNTDOWN_FROM = 5;
const DISCORD_API = 'https://discord.com/api/v10';

const randomDeal = () => deal(() => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32);
const seconds = (ms) => Math.floor(ms / 1000);

const button = (style, label, custom_id) => ({ type: 2, style, label, custom_id });
const nextButton = (gameId, round, solo) => ({ type: 1, components: [button(1, solo ? 'New board' : 'Next round', nextId(gameId, round))] });

// The countdown after a round starts: 5 is shown straight away, then 4, 3, 2, 1, and the board.
const countdownQueue = (now) => [
  ...Array.from({ length: COUNTDOWN_FROM - 1 }, (_, i) => ({ at: now + (i + 1) * 1000, type: 'tick', n: COUNTDOWN_FROM - 1 - i })),
  { at: now + COUNTDOWN_FROM * 1000, type: 'flash' },
];

// ── Durable Object: one per game ──────────────────────────────────────────────
//
// The round plays out in one public message that this object edits on a timer with the
// token of the interaction that started the round (valid for 15 minutes).

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

  // A fresh round: save it with the countdown scheduled, remembering which interaction to edit with.
  async #startRound(state, token, now) {
    await this.ctx.storage.put('live', { token });
    await this.#save(state, countdownQueue(now));
  }

  async openLobby(gameId, origin, appId, token) {
    const now = Date.now();
    const queue = [{ at: now + LOBBY_MS, type: 'lobby_expire', token }];
    await this.ctx.storage.put({ meta: { gameId, origin, appId, closesAt: now + LOBBY_MS }, lobby: newLobby(), queue });
    await this.ctx.storage.setAlarm(now + LOBBY_MS);
    return { closesAt: now + LOBBY_MS };
  }

  async join(userId, spot, token) {
    const { lobby, state, meta } = await this.#load();
    if (!lobby) return { type: state ? 'started' : 'expired' };
    const out = claim(lobby, userId, spot);
    if (out.result.type === 'taken' || out.result.type === 'already_in') return out.result;
    if (out.result.type !== 'full') {
      await this.ctx.storage.put('lobby', out.lobby);
      return { type: 'updated', spots: out.lobby.spots, closesAt: meta.closesAt };
    }
    const now = Date.now();
    const game = newGame(out.lobby.spots, randomDeal(), now);
    await this.ctx.storage.delete('lobby');
    await this.#startRound(game, token, now);
    return { type: 'started', players: game.players, wins: game.wins };
  }

  async startSolo(userId, gameId, origin, appId, token) {
    const now = Date.now();
    await this.ctx.storage.put('meta', { gameId, origin, appId });
    await this.#startRound(newGame([userId], randomDeal(), now), token, now);
  }

  // Read-only gate before the picker opens or changes. `answer` stays the authority.
  async check(userId, round) {
    const { state } = await this.#load();
    if (!state) return { type: 'expired' };
    if (isStale(state, round)) return { type: 'stale' };
    if (!state.players.includes(userId)) return { type: 'not_player' };
    if (state.status === 'finished') return { type: 'finished' };
    if (!state.roundOpen) return { type: 'round_over' };
    const p = state.per[userId];
    if (p.answer !== null) return { type: 'already_answered' };
    if (p.forfeited || (p.deadline !== null && Date.now() > p.deadline)) return { type: 'late' };
    if (p.hiddenAt === null) return { type: 'still_looking' };
    return { type: 'ok', deadline: p.deadline };
  }

  async answer(userId, round, text) {
    const parsed = parseAnswer(text);
    if (!parsed.ok) return { type: 'invalid' };
    const { state, queue, meta, live } = await this.#load();
    if (!state) return { type: 'expired' };
    if (isStale(state, round)) return { type: 'stale' };
    const out = submitAnswer(state, userId, parsed.picks, Date.now());
    const resolved = out.result.roundResult;
    if (out.state !== state) {
      // A resolved round has no answer windows left to police.
      await this.#save(out.state, resolved ? queue.filter((i) => i.type !== 'deadline') : queue);
    }
    if (out.result.type === 'waiting' || resolved) {
      // The public message shows who has locked in, or the result.
      const components = resolved ? this.#resultParts(meta, out.state, resolved) : this.#hiddenParts(meta, out.state);
      await this.#patch(live?.token, components, meta.appId);
    }
    return { ...out.result, picks: parsed.picks, solo: state.mode === 'solo' };
  }

  async next(userId, round, token) {
    const { state } = await this.#load();
    if (!state) return { type: 'expired' };
    if (isStale(state, round)) return { type: 'stale' };
    if (!state.players.includes(userId)) return { type: 'not_player' };
    const now = Date.now();
    const out = nextRound(state, randomDeal(), now);
    if (out.result.type !== 'ok') return out.result;
    await this.#startRound(out.state, token, now);
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
      } else if (item.type === 'deadline') {
        const out = forfeitExpired(current, now);
        current = out.state;
        if (!out.resolved) continue;
        pending = pending.filter((i) => i.type !== 'deadline');
        edits.push(this.#resultParts(meta, current, out.resolved));
      }
    }
    await this.#save(current, pending);
    for (const components of edits) await this.#patch(live?.token, components, meta.appId);
  }

  #hiddenParts(meta, state) {
    const deadline = state.per[state.players[0]].deadline;
    return [
      ...hiddenComponents(state.deal.shared, seconds(deadline), meta.origin, lockStatus(state.players, state.per)),
      openRow(meta.gameId, state.round),
    ];
  }

  #resultParts(meta, state, result) {
    const solo = state.mode === 'solo';
    return [
      ...roundComponents(state.players, result, state.deal, meta.origin),
      ...(result.finished ? [] : [nextButton(meta.gameId, result.round, solo)]),
    ];
  }

  // Edit the round's message. Interaction tokens last 15 minutes, far longer than a round.
  async #patch(token, components, appId) {
    // Games started before the live flow have no token to edit with.
    if (!token || !appId) return;
    try {
      await fetch(`${DISCORD_API}/webhooks/${appId}/${token}/messages/@original`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ components, flags: COMPONENTS_V2, allowed_mentions: { parse: [] } }),
      });
    } catch {
      // The message stays as it was; the next timed step still runs.
    }
  }
}

// ── Responses ─────────────────────────────────────────────────────────────────

const REFUSALS = {
  expired: 'This game expired. Start a new one with `/memorypoker`.',
  started: 'This game has already started.',
  stale: 'That button is out of date. Use the latest one.',
  not_player: 'This is not your game.',
  finished: 'This match is over. Start a new one with `/memorypoker`.',
  round_over: 'This round is already over.',
  not_viewed: 'The board has not been shown yet.',
  still_looking: 'Wait until the board is hidden.',
  already_answered: 'You already locked in your squares this round.',
  late: 'Time ran out for this round.',
  invalid: 'Pick two different squares.',
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

// A third pick replaces the oldest one, and picking a chosen square takes it off.
const togglePick = (sel, letter) => (sel.includes(letter) ? sel.replace(letter, '') : (sel + letter).slice(-2));

export async function handleMemoryPokerComponent(interaction, env, origin) {
  const userId = interaction.member.user.id;
  const { action, gameId, round, sel, letter } = parseId(interaction.data.custom_id);
  const stub = gameStub(env, gameId);

  if (action === 'join') {
    const spot = round; // join buttons carry their spot where other ids carry the round
    const result = await stub.join(userId, spot, interaction.token);
    if (result.type === 'already_in') return ephemeral(`You are already Player ${result.spot + 1}. Press your own button again to give the spot up.`);
    if (result.type === 'updated') return updateMessage(lobbyComponents(gameId, result.spots, seconds(result.closesAt)));
    if (result.type === 'started') return updateMessage(countdownComponents(COUNTDOWN_FROM, result.players, 1, result.wins));
    return refusal(result.type);
  }

  if (action === 'open') {
    const view = await stub.check(userId, round);
    if (view.type !== 'ok') return refusal(view.type);
    return componentsMessage([...pickerComponents(seconds(view.deadline), ''), ...pickerRows(gameId, round, '')], EPHEMERAL);
  }

  if (action === 'pick' || action === 'clear') {
    const view = await stub.check(userId, round);
    if (view.type !== 'ok') return refusal(view.type);
    const next = action === 'clear' ? '' : togglePick(sel, letter);
    return updateMessage([...pickerComponents(seconds(view.deadline), next), ...pickerRows(gameId, round, next)]);
  }

  if (action === 'lock') {
    if (sel.length !== 2) return ephemeral('Pick two squares first.');
    const result = await stub.answer(userId, round, `${sel[0]} ${sel[1]}`);
    const squares = [...sel].join(' + ');
    if (result.type === 'waiting') return updateMessage([{ type: 10, content: `Locked in **${squares}**. Waiting for your opponent.` }]);
    if (result.type === 'resolved') return updateMessage([{ type: 10, content: `Locked in **${squares}**. ${result.solo ? 'Your result is above.' : 'The result is in the channel.'}` }]);
    return refusal(result.type);
  }

  if (action === 'next') {
    const result = await stub.next(userId, round, interaction.token);
    if (result.type !== 'ok') return refusal(result.type);
    return updateMessage(countdownComponents(COUNTDOWN_FROM, result.players, result.round, result.wins));
  }

  return ephemeral('Unknown button.');
}
