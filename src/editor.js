import { JsonResponse, sendFollowup } from './utils.js';
import { embedBytes, MAX_EMBED_BYTES } from './routeEmbedPage.js';
import { routeStore } from './routeStore.js';
import { TEMPLATES } from './templates/index.js';
import { outputBlock } from './templates/common.js';
import { applyModal, applyMenu, applyToggle, editModal, panelData, fillBlanks } from './editorPanel.js';

// The template editor: a private panel with a live preview and Edit buttons that
// open pop-ups with every field. One command opens it for any clue type. The draft lives in the route
// store until it is saved.
const EPHEMERAL = 64;

function panel(type, id, template, draft, origin, status = '', extraFlags = 0) {
  const data = panelData(id, template, draft, origin, status);
  return new JsonResponse({ type, data: { ...data, flags: data.flags | extraFlags } });
}
const privately = (content) => new JsonResponse({ type: 4, data: { content, flags: EPHEMERAL } });

// opts: { leg, tag }, only from the old command options. Normally the pop-up asks for them, and
// anything saved for them is brought back when the pop-up is first submitted.
export async function openEditor(interaction, env, origin, type, opts) {
  const template = TEMPLATES[type];
  if (!template) return privately('Unknown clue type.');

  let draft = template.initial(opts);
  if (opts.tag || opts.leg !== undefined) draft = { ...draft, ...(await savedDraft(routeStore(env), interaction.guild_id, template, draft)) };
  draft = { ...draft, type, guildId: interaction.guild_id };
  await routeStore(env).saveDraft(interaction.id, draft);
  // Most types answer the command with the pop-up straight away; the panel follows when it is
  // submitted. Travel opens the panel first so its buttons can be picked before the details.
  if (template.buttonsFirst) return panel(4, interaction.id, template, draft, origin, '', EPHEMERAL);
  return new JsonResponse({ type: 9, data: editModal(interaction.id, template, 0, draft) });
}

// What was saved for this draft's leg or tag, or from the first version of the editor.
async function savedDraft(store, guildId, template, draft) {
  const key = template.draftKey(draft);
  if (!key) return null;
  const saved = await store.getSaved(`${guildId}:${key}`);
  if (saved) return saved;
  const old = template.legacy && (await store.getByKey(`${guildId}:${template.legacy.key(draft)}`));
  return old ? template.legacy.toDraft(old) : null;
}

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
    blocks.push(outputBlock(output, url));
  }
  await store.saveSaved(`${draft.guildId}:${template.draftKey(draft)}`, draft);

  // The first block goes on the panel, the rest follow as private messages in order.
  const rest = blocks.slice(1);
  if (rest.length) {
    ctx.waitUntil((async () => { for (const block of rest) await sendFollowup(env, interaction.token, block); })());
  }
  const many = blocks.length > 1;
  const notice =
    '**Saved, but nothing has been posted.** The bot does not post or create tags for you. ' +
    `**You need to copy ${many ? 'each tag below' : 'the tag below'} and paste ${many ? 'them' : 'it'} yourself** ` +
    '(use the copy button on the code box, then paste it in the channel).';
  const more = rest.length ? `\n-# ${rest.length} more tag${rest.length > 1 ? 's' : ''} below. Copy and paste those too.` : '';
  return panel(7, id, template, draft, origin, `${notice}\n${blocks[0]}${more}`);
}

export async function handleEditorComponent(interaction, env, ctx, origin) {
  const [, action, id, part, value] = interaction.data.custom_id.split(':');
  const store = routeStore(env);
  const draft = await store.getDraft(id);
  if (!draft) return privately('This editor expired. Run the command again.');
  const template = TEMPLATES[draft.type];

  if (action === 'edit') return new JsonResponse({ type: 9, data: editModal(id, template, Number(part), draft) });

  if (action === 'toggle') {
    const next = applyToggle(draft, template, part, value);
    await store.saveDraft(id, next);
    return panel(7, id, template, next, origin);
  }

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
  const fields = interaction.data.components.flatMap((r) => r.components);
  let next = applyModal(draft, template, Number(page), (key) => fields.find((c) => c.custom_id === key)?.value);
  // The first submit is where the leg or tag is typed: bring back anything saved for it, with
  // what was typed taking priority.
  const first = !draft.touched;
  let loaded = false;
  if (first) {
    const saved = await savedDraft(store, draft.guildId, template, next);
    if (saved) {
      next = { ...fillBlanks(next, saved), type: draft.type, guildId: draft.guildId };
      loaded = true;
    }
  }
  next = { ...next, touched: true };
  await store.saveDraft(id, next);
  const badLeg = 'leg' in next && next.leg && !/^\d+$/.test(next.leg);
  const status = badLeg
    ? '**The leg number has to be a number**, like 3. Press Edit to fix it.'
    : loaded ? '-# Loaded what you saved earlier for this one. Anything you typed was kept.' : '';
  // The first submit comes from the command, so there is no panel yet: send it as a new private
  // message. Later submits come from the panel's Edit buttons and update it.
  return interaction.message ? panel(7, id, template, next, origin, status) : panel(4, id, template, next, origin, status, EPHEMERAL);
}
