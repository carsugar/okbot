import { DurableObject } from 'cloudflare:workers';
import { JsonResponse } from './utils.js';
import { SQUARES, deal, parseAnswer } from './pokerRules.js';
import {
  newGame, viewBoard, markHidden, submitAnswer, forfeitExpired, nextRound, isStale,
  enqueue, takeDue, nextAlarmAt,
} from './pokerGame.js';
import {
  startText, boardText, hiddenText, roundText, modalLabel, showId, answerId, nextId, modalId, parseId,
} from './memoryPokerMessages.js';

const EXPIRY_MS = 24 * 60 * 60 * 1000;
const EPHEMERAL = 64;
const DISCORD_API = 'https://discord.com/api/v10';

const randomDeal = () => deal(() => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32);
const seconds = (ms) => Math.floor(ms / 1000);

const button = (style, label, custom_id) => ({ type: 2, style, label, custom_id });
const row = (...components) => ({ type: 1, components });
const showButton = (gameId, round) => row(button(1, 'Show me my board', showId(gameId, round)));
const nextButton = (gameId, round, solo) =>
  row(button(1, solo ? 'New board' : 'Next round', nextId(gameId, round)));

// ── Durable Object: one per game ──────────────────────────────────────────────

export class MemoryPokerGame extends DurableObject {
  async #load() {
    const stored = await this.ctx.storage.get(['state', 'queue', 'meta']);
    return { state: stored.get('state'), queue: stored.get('queue') ?? [], meta: stored.get('meta') };
  }

  async #save(state, queue) {
    await this.ctx.storage.put({ state, queue });
    await this.ctx.storage.setAlarm(nextAlarmAt(queue, state.updatedAt + EXPIRY_MS));
  }

  async start(players, gameId) {
    await this.ctx.storage.put('meta', { gameId });
    await this.#save(newGame(players, randomDeal(), Date.now()), []);
  }

  async show(userId, round, token, appId) {
    const { state, queue } = await this.#load();
    if (!state) return { type: 'expired' };
    if (isStale(state, round)) return { type: 'stale' };
    const out = viewBoard(state, userId, Date.now());
    if (out.result.type !== 'ok') return out.result;
    const item = { at: out.result.hideAt, type: 'hide', userId, token, appId };
    await this.#save(out.state, enqueue(queue, item));
    return out.result;
  }

  // Read-only gate before the answer pop-up opens. `answer` stays the authority.
  async check(userId, round) {
    const { state } = await this.#load();
    if (!state) return { type: 'expired' };
    if (isStale(state, round)) return { type: 'stale' };
    if (!state.players.includes(userId)) return { type: 'not_player' };
    if (state.status === 'finished') return { type: 'finished' };
    if (!state.roundOpen) return { type: 'round_over' };
    const p = state.per[userId];
    if (p.viewedAt === null) return { type: 'not_viewed' };
    if (p.answer !== null) return { type: 'already_answered' };
    if (p.forfeited || (p.deadline !== null && Date.now() > p.deadline)) return { type: 'late' };
    if (p.hiddenAt === null) return { type: 'still_looking' };
    return { type: 'ok' };
  }

  async answer(userId, round, text) {
    const parsed = parseAnswer(text);
    if (!parsed.ok) return { type: 'invalid' };
    const { state, queue } = await this.#load();
    if (!state) return { type: 'expired' };
    if (isStale(state, round)) return { type: 'stale' };
    const out = submitAnswer(state, userId, parsed.picks, Date.now());
    const resolved = out.result.roundResult;
    if (out.state !== state) {
      // A resolved round has no answer windows left to police.
      await this.#save(out.state, resolved ? queue.filter((i) => i.type !== 'deadline') : queue);
    }
    if (!resolved) return { ...out.result, picks: parsed.picks };
    return { ...out.result, players: state.players, deal: state.deal, mode: state.mode };
  }

  async next(userId, round) {
    const { state } = await this.#load();
    if (!state) return { type: 'expired' };
    if (isStale(state, round)) return { type: 'stale' };
    if (!state.players.includes(userId)) return { type: 'not_player' };
    const out = nextRound(state, randomDeal(), Date.now());
    if (out.result.type !== 'ok') return out.result;
    await this.#save(out.state, []);
    return { type: 'ok', players: out.state.players, round: out.state.round, wins: out.state.wins };
  }

  async alarm() {
    const { state, queue, meta } = await this.#load();
    if (!state) return;
    const now = Date.now();
    if (now >= state.updatedAt + EXPIRY_MS) {
      await this.ctx.storage.deleteAll();
      return;
    }

    // Decide everything and save it first. Network calls let other requests run, so saving
    // afterwards would overwrite an answer that arrived in the meantime.
    const { due, rest } = takeDue(queue, now);
    let current = state;
    let pending = rest;
    const effects = [];
    for (const item of due) {
      if (item.type === 'hide') {
        const out = markHidden(current, item.userId, now);
        current = out.state;
        if (out.result.type !== 'ok') continue;
        // One millisecond past the deadline, because an answer exactly at the deadline still counts.
        pending = enqueue(pending, { ...item, at: out.result.deadline + 1, type: 'deadline' });
        const content = hiddenText(out.result.shared, seconds(out.result.deadline));
        const components = [row(button(1, 'Enter your two squares', answerId(meta.gameId, current.round)))];
        effects.push([item, 'PATCH', '/messages/@original', { content, components }]);
      } else {
        const out = forfeitExpired(current, now);
        current = out.state;
        if (!out.resolved) continue;
        pending = pending.filter((i) => i.type !== 'deadline');
        effects.push([item, 'POST', '', this.#announcement(meta.gameId, current, out.resolved)]);
      }
    }
    await this.#save(current, pending);
    for (const effect of effects) await this.#webhook(...effect);
  }

  // Result of a round that ended on a timeout, posted with the timed-out player's fresh token.
  #announcement(gameId, state, result) {
    const solo = state.mode === 'solo';
    return {
      content: roundText(state.players, result, state.deal),
      components: result.finished ? [] : [nextButton(gameId, result.round, solo)],
      allowed_mentions: { parse: [] },
      ...(solo ? { flags: EPHEMERAL } : {}),
    };
  }

  // Interaction tokens last 15 minutes, far longer than the 20 s flash or 60 s answer window.
  async #webhook(item, method, path, body) {
    try {
      await fetch(`${DISCORD_API}/webhooks/${item.appId}/${item.token}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch {
      // The message stays as it was; the next alarm still runs.
    }
  }
}

// ── Responses ─────────────────────────────────────────────────────────────────

const REFUSALS = {
  expired: 'This game expired. Start a new one with `/memorypoker`.',
  stale: 'That button is out of date. Use the latest one.',
  not_player: 'This is not your game.',
  finished: 'This match is over. Start a new one with `/memorypoker`.',
  round_over: 'This round is already over.',
  already_viewed: 'You already looked at the board this round.',
  not_viewed: 'Press **Show me my board** first.',
  still_looking: 'Wait until the board is hidden.',
  already_answered: 'You already locked in your squares this round.',
  late: 'Time ran out for this round.',
  invalid: 'Enter two different squares from A to P, like C J.',
};

const ephemeral = (content) => new JsonResponse({ type: 4, data: { content, flags: EPHEMERAL } });
const refusal = (type) => ephemeral(REFUSALS[type] ?? 'Something went wrong. Start a new game with `/memorypoker`.');
const message = (content, components, flags = 0) =>
  new JsonResponse({ type: 4, data: { content, components, flags, allowed_mentions: { parse: [] } } });

const gameStub = (env, gameId) => env.MEMORY_POKER.get(env.MEMORY_POKER.idFromName(gameId));

// ── Handlers ──────────────────────────────────────────────────────────────────

export async function handleMemoryPokerCommand(interaction, env) {
  const invokerId = interaction.member.user.id;
  const opponentId = interaction.data.options?.find((o) => o.name === 'opponent')?.value;
  if (opponentId === invokerId) return ephemeral('Pick someone else, or leave the opponent empty to play solo.');
  if (opponentId && interaction.data.resolved.users[opponentId].bot) return ephemeral('Bots cannot play Memory Poker.');

  const players = opponentId ? [invokerId, opponentId] : [invokerId];
  const gameId = interaction.id;
  await gameStub(env, gameId).start(players, gameId);
  const wins = Object.fromEntries(players.map((p) => [p, 0]));
  return new JsonResponse({
    type: 4,
    data: {
      content: startText(players, 1, wins),
      components: [showButton(gameId, 1)],
      allowed_mentions: opponentId ? { users: players } : { parse: [] },
      // Solo is practice, so it stays private.
      ...(opponentId ? {} : { flags: EPHEMERAL }),
    },
  });
}

export async function handleMemoryPokerComponent(interaction, env) {
  const userId = interaction.member.user.id;
  const { action, gameId, round } = parseId(interaction.data.custom_id);
  const stub = gameStub(env, gameId);

  if (action === 'show') {
    const appId = interaction.application_id ?? env.DISCORD_APPLICATION_ID;
    const result = await stub.show(userId, round, interaction.token, appId);
    if (result.type !== 'ok') return refusal(result.type);
    return ephemeral(boardText(result.board, seconds(result.hideAt)));
  }

  if (action === 'answer') {
    const result = await stub.check(userId, round);
    if (result.type !== 'ok') return refusal(result.type);
    return new JsonResponse({
      type: 9,
      data: {
        custom_id: modalId(gameId, round),
        title: `Memory Poker: Round ${round}`,
        components: [row({ type: 4, custom_id: 'squares', label: modalLabel, style: 1, required: true, max_length: 12 })],
      },
    });
  }

  if (action === 'next') {
    const result = await stub.next(userId, round);
    if (result.type !== 'ok') return refusal(result.type);
    const solo = result.players.length === 1;
    return message(startText(result.players, result.round, result.wins), [showButton(gameId, result.round)], solo ? EPHEMERAL : 0);
  }

  return ephemeral('Unknown button.');
}

export async function handleMemoryPokerModal(interaction, env) {
  const userId = interaction.member.user.id;
  const { gameId, round } = parseId(interaction.data.custom_id);
  const text = interaction.data.components
    .flatMap((r) => r.components)
    .find((c) => c.custom_id === 'squares').value;

  const result = await gameStub(env, gameId).answer(userId, round, text);

  if (result.roundResult) {
    const { roundResult: r } = result;
    const solo = result.mode === 'solo';
    return message(
      roundText(result.players, r, result.deal),
      r.finished ? [] : [nextButton(gameId, r.round, solo)],
      solo ? EPHEMERAL : 0,
    );
  }
  if (result.type === 'waiting') {
    const squares = result.picks.map((i) => SQUARES[i]).join(' + ');
    return ephemeral(`Locked in **${squares}**. Waiting for your opponent.`);
  }
  return refusal(result.type);
}
