import { DurableObject } from 'cloudflare:workers';
import { JsonResponse } from './utils.js';
import { newGame, submitWord } from './mindmeldRules.js';

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
    return state.status === 'won' ? 'finished' : 'ok';
  }

  async submit(userId, word) {
    const state = await this.ctx.storage.get('state');
    if (!state) return { type: 'expired' };
    const { state: next, result } = submitWord(state, userId, word, Date.now());
    if (next !== state) await this.#save(next);
    if (result.type !== 'revealed') return result;
    return { ...result, players: next.players, history: next.history };
  }

  async alarm() {
    await this.ctx.storage.deleteAll();
  }
}

// ── Messages ──────────────────────────────────────────────────────────────────

const REFUSALS = {
  not_player: 'This is not your game.',
  finished: 'This game is already over. Start a new one with `/mindmeld`.',
  expired: 'This game expired. Start a new one with `/mindmeld`.',
  invalid: 'One word only, up to 32 characters.',
  already_submitted: 'You already locked in a word this round.',
};

const ephemeral = (content) => new JsonResponse({ type: 4, data: { content, flags: EPHEMERAL } });

const submitButton = (gameId) => ({
  type: 1,
  components: [{ type: 2, style: 1, label: 'Submit word', custom_id: `mm:submit:${gameId}` }],
});

const roundLine = (players, round, i) =>
  `Round ${i + 1}: ${players.map((p) => `<@${p}> **${round[p]}**`).join(' · ')}`;

function revealMessage(gameId, r) {
  const lines = r.history.map((round, i) => roundLine(r.players, round, i));
  if (r.matched) {
    const note = r.exact ? '' : ' (counted as a match)';
    return { content: `🎉 **Mind meld!**${note}\n${lines.join('\n')}`, allowed_mentions: { parse: [] } };
  }
  const [x, y] = r.players.map((p) => r.words[p]);
  return {
    content: [
      ...lines,
      `Next: a word that connects **${x}** and **${y}**.`,
      '-# Think a pair should have matched? Tell the organizers.',
    ].join('\n'),
    components: [submitButton(gameId)],
    allowed_mentions: { parse: [] },
  };
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
      content: [
        `<@${invokerId}> and <@${partnerId}>, it's time for **Mind Meld**!`,
        'Each of you privately enters a word. When both are in, they are revealed together.',
        'Then keep entering a word that connects the last two, until you land on the same one.',
      ].join('\n'),
      components: [submitButton(interaction.id)],
      allowed_mentions: { users: [invokerId, partnerId] },
    },
  });
}

export async function handleMindMeldComponent(interaction, env) {
  const gameId = interaction.data.custom_id.split(':')[2];
  const status = await gameStub(env, gameId).check(interaction.member.user.id);
  if (status !== 'ok') return ephemeral(REFUSALS[status]);

  return new JsonResponse({
    type: 9,
    data: {
      custom_id: `mm_modal:${gameId}`,
      title: 'Mind Meld',
      components: [
        {
          type: 1,
          components: [{ type: 4, custom_id: 'word', label: 'Your word', style: 1, required: true, max_length: 32 }],
        },
      ],
    },
  });
}

export async function handleMindMeldModal(interaction, env) {
  const gameId = interaction.data.custom_id.split(':')[1];
  const word = interaction.data.components
    .flatMap((row) => row.components)
    .find((c) => c.custom_id === 'word').value;

  const result = await gameStub(env, gameId).submit(interaction.member.user.id, word);
  if (result.type === 'waiting') return ephemeral('Locked in. Waiting for your partner.');
  if (result.type !== 'revealed') return ephemeral(REFUSALS[result.type]);
  return new JsonResponse({ type: 4, data: revealMessage(gameId, result) });
}
