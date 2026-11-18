import { JsonResponse, sendFollowup } from './utils.js';
import { legTagText, mimuAutoresponder, bannerImage, legStartEmbed } from './legStartCard.js';
import { embedBytes, MAX_EMBED_BYTES } from './routeEmbedPage.js';
import { routeStore } from './routeStore.js';
import { emptyDraft, draftFromSaved, draftToLeg, applyModal, sectionModal, panelData, isReady } from './legEditorPanel.js';

// The Leg Start editor: a private panel with a live preview, one button per section, and a
// pop-up for each. The draft lives in the route store until it is saved.
const CARLBOT_MENTION = '<@235148962103951360>';
const EPHEMERAL = 64;

const keyFor = (guildId, leg) => `${guildId}:leg-${leg}`;
function panel(type, id, draft, origin, status = '', extraFlags = 0) {
  const data = panelData(id, draft, origin, status);
  return new JsonResponse({ type, data: { ...data, flags: data.flags | extraFlags } });
}
const privately = (content) => new JsonResponse({ type: 4, data: { content, flags: EPHEMERAL } });

export async function openLegEditor(interaction, env, origin, leg) {
  const store = routeStore(env);
  const saved = await store.getByKey(keyFor(interaction.guild_id, leg));
  const draft = saved ? draftFromSaved(interaction.guild_id, saved) : emptyDraft(interaction.guild_id, leg);
  await store.saveDraft(interaction.id, draft);
  return panel(4, interaction.id, draft, origin, '', EPHEMERAL);
}

async function save(interaction, env, ctx, origin, id, draft) {
  const data = draftToLeg(draft);
  if (!isReady(draft) || embedBytes(legStartEmbed(data, bannerImage(origin, data.banner))) > MAX_EMBED_BYTES) {
    return panel(7, id, draft, origin);
  }
  const slug = await routeStore(env).save(keyFor(draft.guildId, draft.leg), data);
  const url = `${origin}/route/${slug}`;
  const tagName = `test-leg-${draft.leg}`;
  const autoresponder = mimuAutoresponder(data);
  if (autoresponder) {
    ctx.waitUntil(sendFollowup(env, interaction.token, `**Mimu autoresponder: \`${data.moneyCommand}\`**\n\`\`\`\n${autoresponder}\n\`\`\``));
  }
  const status = `**Saved. Leg Start tag (\`!${tagName}\`)**\n\`\`\`\n${legTagText({ carlbotMention: CARLBOT_MENTION, tagName, url })}\n\`\`\`\nPreview: ${url}`;
  return panel(7, id, draft, origin, status);
}

export async function handleLegEditorComponent(interaction, env, ctx, origin) {
  const [, action, id, section] = interaction.data.custom_id.split(':');
  const store = routeStore(env);
  const draft = await store.getDraft(id);
  if (!draft) return privately('This editor expired. Run the command again.');

  if (action === 'edit') return new JsonResponse({ type: 9, data: sectionModal(id, section, draft) });

  if (action === 'banner') {
    const next = { ...draft, banner: interaction.data.values[0] };
    await store.saveDraft(id, next);
    return panel(7, id, next, origin);
  }

  return save(interaction, env, ctx, origin, id, draft);
}

export async function handleLegEditorModal(interaction, env, origin) {
  const [, id, section] = interaction.data.custom_id.split(':');
  const store = routeStore(env);
  const draft = await store.getDraft(id);
  if (!draft) return privately('This editor expired. Run the command again.');
  const fields = interaction.data.components.flatMap((r) => r.components);
  const next = applyModal(draft, section, (key) => fields.find((c) => c.custom_id === key)?.value);
  await store.saveDraft(id, next);
  return panel(7, id, next, origin);
}
