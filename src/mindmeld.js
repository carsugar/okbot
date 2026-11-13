import { DurableObject } from 'cloudflare:workers';
import { JsonResponse } from './utils.js';
import { newGame, submitWord, preflight, endGame, isStale, normalizeWord } from './mindmeldRules.js';
import { lobbyText, revealText, endedText, modalPrompt, useButtonId, parseUseId } from './mindmeldMessages.js';
import { lookupWord } from './dictionary.js';

const EXPIRY_MS = 24 * 60 * 60 * 1000;
const EPHEMERAL = 64;

// ── Durable Object: one per game ──────────────────────────────────────────────

export class MindMeldGame extends DurableObject {
  async #save(state) {
    await this.ctx.storage.put('state', state);
    await this.ctx.storage.setAlarm(state.updatedAt + EXPIRY_MS);
  }

  async start(players) {
    await this.#save(newGame(players, Date.now()));
  }

  async check(userId) {
    const state = await this.ctx.storage.get('state');
    if (!state) return 'expired';
    if (!state.players.includes(userId)) return 'not_player';
    return { won: 'finished', ended: 'ended' }[state.status] ?? 'ok';
  }

  async prompt() {
    const state = await this.ctx.storage.get('state');
    return state ? { players: state.players, history: state.history } : { players: [], history: [] };
  }

  // Advisory early refusal (repeat, double submit...); `submit` stays the authority.
  async preflight(userId, word) {
    const state = await this.ctx.storage.get('state');
    return state ? { ...preflight(state, userId, word), rounds: state.history.length } : { type: 'expired' };
  }

  async submit(userId, word, shownInRound) {
    const state = await this.ctx.storage.get('state');
    if (!state) return { type: 'expired' };
    if (shownInRound !== undefined && state.status === 'active' && isStale(state, shownInRound)) return { type: 'stale' };
    const { state: next, result } = submitWord(state, userId, word, Date.now());
    if (next !== state) await this.#save(next);
    if (result.type !== 'revealed') return result;
    return { ...result, players: next.players, history: next.history };
  }

  async end(userId) {
    const state = await this.ctx.storage.get('state');
    if (!state) return { type: 'expired' };
    const { state: next, result } = endGame(state, userId, Date.now());
    if (next !== state) await this.#save(next);
    if (result.type !== 'ended_now') return result;
    return { ...result, players: next.players, history: next.history };
  }

  async alarm() {
    await this.ctx.storage.deleteAll();
  }
}

// ── Responses ─────────────────────────────────────────────────────────────────

const REFUSALS = {
  not_player: () => 'This is not your game.',
  finished: () => 'This game is already over. Start a new one with `/mindmeld`.',
  ended: () => 'This game was ended. Start a new one with `/mindmeld`.',
  expired: () => 'This game expired. Start a new one with `/mindmeld`.',
  invalid: () => 'One word only, up to 32 characters.',
  already_submitted: () => 'You already locked in a word this round.',
  stale: () => 'That prompt is out of date. Use the latest **Submit word** button.',
  repeat: (word) => `**${word}** was already said in this game. Pick a different word.`,
};

const refusal = (type, word) => ephemeral(REFUSALS[type](word));
const ephemeral = (content) => new JsonResponse({ type: 4, data: { content, flags: EPHEMERAL } });
const update = (data) => new JsonResponse({ type: 7, data });

const button = (style, label, custom_id) => ({ type: 2, style, label, custom_id });
const row = (...components) => ({ type: 1, components });
const playButtons = (gameId) =>
  row(button(1, 'Submit word', `mm:submit:${gameId}`), button(4, 'End game', `mm:end:${gameId}`));

const publicMessage = (content, components = []) =>
  new JsonResponse({ type: 4, data: { content, components, allowed_mentions: { parse: [] } } });

// The reveal is the response of whoever submitted last; a match ends the buttons.
function outcome(gameId, result, word, onWaiting) {
  if (result.type === 'waiting') return onWaiting();
  if (result.type !== 'revealed') return refusal(result.type, word);
  return publicMessage(revealText(result), result.matched ? [] : [playButtons(gameId)]);
}

const lockedIn = () => ephemeral('Locked in. Waiting for your partner.');
const lockedInUpdate = () => update({ content: 'Locked in. Waiting for your partner.', components: [] });

function unknownWordResponse(gameId, round, word, suggestions) {
  const buttons = [
    ...suggestions.map((s) => button(2, `Use "${s}"`, useButtonId(gameId, round, s))),
    button(2, `Use "${word}" anyway`, useButtonId(gameId, round, word)),
    button(1, 'Change word', `mm:submit:${gameId}`),
  ];
  const didYouMean = suggestions.length ? ' Did you mean one of these?' : '';
  return new JsonResponse({
    type: 4,
    data: { content: `\`${word}\` isn't in my dictionary.${didYouMean}`, components: [row(...buttons)], flags: EPHEMERAL },
  });
}

// ── Handlers ──────────────────────────────────────────────────────────────────

const gameStub = (env, gameId) => env.MIND_MELD.get(env.MIND_MELD.idFromName(gameId));

export async function handleMindMeldCommand(interaction, env) {
  const invokerId = interaction.member.user.id;
  const partnerId = interaction.data.options.find((o) => o.name === 'partner').value;
  if (partnerId === invokerId) return ephemeral('Pick someone else as your partner.');
  if (interaction.data.resolved.users[partnerId].bot) return ephemeral('Bots cannot play Mind Meld.');

  await gameStub(env, interaction.id).start([invokerId, partnerId]);
  return new JsonResponse({
    type: 4,
    data: {
      content: lobbyText([invokerId, partnerId]),
      components: [playButtons(interaction.id)],
      allowed_mentions: { users: [invokerId, partnerId] },
    },
  });
}

const wordModal = (gameId, { players, history }) => {
  const { title, label } = modalPrompt(players, history);
  return new JsonResponse({
    type: 9,
    data: {
      custom_id: `mm_modal:${gameId}`,
      title,
      components: [row({ type: 4, custom_id: 'word', label, style: 1, required: true, max_length: 32 })],
    },
  });
};

export async function handleMindMeldComponent(interaction, env) {
  const userId = interaction.member.user.id;
  const customId = interaction.data.custom_id;
  const [, action, gameId] = customId.split(':');

  if (action === 'use') {
    const { gameId: id, round, word } = parseUseId(customId);
    return outcome(id, await gameStub(env, id).submit(userId, word, round), word, lockedInUpdate);
  }

  if (action === 'keep') return update({ content: 'Okay, keep playing.', components: [] });

  if (action === 'endyes') {
    const result = await gameStub(env, gameId).end(userId);
    if (result.type !== 'ended_now') return refusal(result.type);
    return publicMessage(endedText({ ...result, endedBy: userId }));
  }

  // submit and end both need a live game that this user is playing.
  const status = await gameStub(env, gameId).check(userId);
  if (status !== 'ok') return refusal(status);

  if (action === 'end') {
    return new JsonResponse({
      type: 4,
      data: {
        content: 'End the game? Nothing will be scored.',
        components: [row(button(4, 'Yes, end it', `mm:endyes:${gameId}`), button(2, 'Keep playing', `mm:keep:${gameId}`))],
        flags: EPHEMERAL,
      },
    });
  }
  return wordModal(gameId, await gameStub(env, gameId).prompt());
}

export async function handleMindMeldModal(interaction, env) {
  const gameId = interaction.data.custom_id.split(':')[1];
  const userId = interaction.member.user.id;
  const word = interaction.data.components
    .flatMap((r) => r.components)
    .find((c) => c.custom_id === 'word').value.trim();
  const stub = gameStub(env, gameId);

  const early = await stub.preflight(userId, word);
  if (early.type !== 'ok') return refusal(early.type, word);

  const { known, suggestions } = await lookupWord(word);
  if (!known) return unknownWordResponse(gameId, early.rounds, word, suggestions.filter(normalizeWord));

  return outcome(gameId, await stub.submit(userId, word), word, lockedIn);
}
