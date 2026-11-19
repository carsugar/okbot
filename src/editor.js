import { JsonResponse, sendFollowup } from './utils.js';
import { embedBytes, MAX_EMBED_BYTES } from './routeEmbedPage.js';
import { routeStore } from './routeStore.js';
import { TEMPLATES } from './templates/index.js';
import { tagOf, sameTag, clueLabel } from './clueTags.js';
import { outputBlock } from './templates/common.js';
import { applyModal, applyMenu, editModal, panelData, copyMessages } from './editorPanel.js';

// The clue editor: a private panel with a live preview and Edit buttons that open pop-ups with
// every field. /create_clue starts a new clue, /edit_clue reopens a saved one by its tag. The
// draft lives in the route store until it is saved.
const EPHEMERAL = 64;

function panel(type, id, template, draft, origin, status = '', extraFlags = 0, saved = '') {
  const data = panelData(id, template, draft, origin, status, saved);
  return new JsonResponse({ type, data: { ...data, flags: data.flags | extraFlags } });
}
const privately = (content) => new JsonResponse({ type: 4, data: { content, flags: EPHEMERAL } });

// A new clue. The pop-up asks for the leg number or tag name.
export async function openEditor(interaction, env, origin, type, opts) {
  const template = TEMPLATES[type];
  if (!template) return privately('Unknown clue type.');
  const draft = { ...template.initial(opts), type, guildId: interaction.guild_id };
  await routeStore(env).saveDraft(interaction.id, draft);
  // The command answers with the first pop-up straight away; the panel follows when it is submitted.
  return new JsonResponse({ type: 9, data: editModal(interaction.id, template, 0, draft) });
}

const savedClues = async (env, guildId) =>
  (await routeStore(env).listSaved(guildId)).map((draft) => ({ draft, tag: tagOf(draft) })).filter((c) => c.tag);

// /edit_clue: reopen the saved clue whose tag was given.
export async function editSaved(interaction, env, origin, tag) {
  const found = (await savedClues(env, interaction.guild_id)).find((c) => sameTag(c.tag, tag ?? ''));
  if (!found) return privately(`No saved clue has the tag \`${tag}\`. Start typing the tag and pick one from the list.`);
  const draft = { ...found.draft, type: found.draft.type, guildId: interaction.guild_id, touched: true };
  await routeStore(env).saveDraft(interaction.id, draft);
  return panel(4, interaction.id, TEMPLATES[draft.type], draft, origin, '', EPHEMERAL);
}

// Suggestions while typing the tag for /edit_clue.
export async function tagSuggestions(interaction, env) {
  const typed = (interaction.data.options?.find((o) => o.focused)?.value ?? '').toLowerCase();
  const choices = (await savedClues(env, interaction.guild_id))
    .map((c) => ({ ...c, name: clueLabel(c.draft) }))
    .filter((c) => `${c.name} ${c.tag}`.toLowerCase().includes(typed))
    .sort((a, b) => (Number(a.draft.leg) || 0) - (Number(b.draft.leg) || 0) || a.name.localeCompare(b.name))
    .slice(0, 25)
    .map((c) => ({ name: c.name, value: c.tag.slice(0, 100) }));
  return new JsonResponse({ type: 8, data: { choices } });
}

async function savedDraft(store, guildId, template, draft) {
  const key = template.draftKey(draft);
  if (!key) return null;
  const saved = await store.getSaved(`${guildId}:${key}`);
  if (saved) return saved;
  const old = template.legacy && (await store.getByKey(`${guildId}:${template.legacy.key(draft)}`));
  return old ? template.legacy.toDraft(old) : null;
}

// The big heading at the top of the tags to copy.
const copyHeading = (count) =>
  `# Copy and send ${count > 1 ? `these ${count} tags` : 'this tag'} to create ${count > 1 ? 'them' : 'it'}\n` +
  `**No tags have been created yet.** ${count > 1 ? 'Copy each numbered block below and send it in the channel as its own message.' : 'Copy the block below and send it in the channel.'}`;

async function save(interaction, env, ctx, origin, id, template, draft) {
  const outputs = template.ready(draft) ? template.outputs(draft, origin) : [];
  const tooLong = outputs.some((o) => o.kind === 'card' && embedBytes(o.embed) > MAX_EMBED_BYTES);
  if (!outputs.length || tooLong) return panel(7, id, template, draft, origin);

  const store = routeStore(env);
  const blocks = [];
  for (const output of outputs) {
    const url = output.kind === 'card'
      ? `${origin}/route/${await store.save(`${draft.guildId}:${output.key}`, { embed: output.embed, title: output.title, description: output.description })}`
      : '';
    blocks.push(`${blocks.length + 1}. ${outputBlock(output, url)}`);
  }
  await store.saveSaved(`${draft.guildId}:${template.draftKey(draft)}`, draft);

  // The tags to copy come as one new private message (or a few if they are long), after the
  // panel. The panel itself only says what to do.
  const messages = copyMessages([copyHeading(blocks.length), ...blocks]);
  ctx.waitUntil((async () => { for (const message of messages) await sendFollowup(env, interaction.token, message); })());
  const many = blocks.length > 1;
  const where = messages.length > 1 ? `in the ${messages.length} messages below` : 'in the message below';
  const notice =
    '**Saved, but nothing has been posted.** The bot does not post or create tags for you. ' +
    `**You need to copy ${many ? 'each tag' : 'the tag'} ${where} and paste ${many ? 'them' : 'it'} yourself** ` +
    '(use the copy button on each code box, then paste it in the channel).';
  return panel(7, id, template, draft, origin, '', 0, notice);
}

export async function handleEditorComponent(interaction, env, ctx, origin) {
  const [, action, id, part] = interaction.data.custom_id.split(':');
  const store = routeStore(env);
  const draft = await store.getDraft(id);
  if (!draft) return privately('This editor expired. Run the command again.');
  const template = TEMPLATES[draft.type];

  if (action === 'edit') return new JsonResponse({ type: 9, data: editModal(id, template, Number(part), draft) });

  if (action === 'menu') {
    const next = applyMenu(draft, template, part, interaction.data.values);
    await store.saveDraft(id, next);
    return panel(7, id, template, next, origin);
  }

  return save(interaction, env, ctx, origin, id, template, draft);
}

export async function handleEditorModal(interaction, env, origin) {
  const [, id, page] = interaction.data.custom_id.split(':');
  const store = routeStore(env);
  const draft = await store.getDraft(id);
  if (!draft) return privately('This editor expired. Run the command again.');
  const template = TEMPLATES[draft.type];
  const fields = interaction.data.components.flatMap((r) => r.components ?? (r.component ? [r.component] : []));
  let next = applyModal(draft, template, Number(page), (key) => { const c = fields.find((f) => f.custom_id === key); return c?.values ?? c?.value; });
  // The first submit is where the leg or tag is typed. If something is already saved for it,
  // say so, since saving would replace it.
  const key = !draft.touched && template.draftKey(next);
  const exists = key && (await store.getSaved(`${draft.guildId}:${key}`));
  next = { ...next, touched: true };
  await store.saveDraft(id, next);
  const badLeg = 'leg' in next && next.leg && !/^\d+$/.test(next.leg);
  const status = badLeg
    ? '**The leg number has to be a number**, like 3. Press Edit to fix it.'
    : exists ? '⚠️ **A clue like this is already saved.** Saving will replace it. To change the saved one, use `/edit_clue` with its tag.' : '';
  const warning = template.warning?.(next) ?? '';
  // The first submit comes from the command, so there is no panel yet: send it as a new private
  // message. Later submits come from the panel's Edit buttons and update it.
  return interaction.message ? panel(7, id, template, next, origin, [status, warning].filter(Boolean).join('\n')) : panel(4, id, template, next, origin, [status, warning].filter(Boolean).join('\n'), EPHEMERAL);
}
