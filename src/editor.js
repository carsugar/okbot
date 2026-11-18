import { JsonResponse, sendFollowup } from './utils.js';
import { embedBytes, MAX_EMBED_BYTES } from './routeEmbedPage.js';
import { routeStore } from './routeStore.js';
import { TEMPLATES } from './templates/index.js';
import { outputBlock } from './templates/common.js';
import { applyModal, applyMenu, sectionModal, panelData } from './editorPanel.js';

// The template editor: a private panel with a live preview, a button per section and a
// pop-up for each. One command opens it for any clue type. The draft lives in the route
// store until it is saved.
const EPHEMERAL = 64;

function panel(type, id, template, draft, origin, status = '', extraFlags = 0) {
  const data = panelData(id, template, draft, origin, status);
  return new JsonResponse({ type, data: { ...data, flags: data.flags | extraFlags } });
}
const privately = (content) => new JsonResponse({ type: 4, data: { content, flags: EPHEMERAL } });

// opts: { leg, tag }. Reopens what was saved for the same leg or tag, if anything.
export async function openEditor(interaction, env, origin, type, opts) {
  const template = TEMPLATES[type];
  if (!template) return privately('Unknown clue type.');
  const missing = template.needs.find((n) => opts[n] === undefined);
  if (missing) return privately(`The **${template.label}** type needs a \`${missing}\` number.`);

  const store = routeStore(env);
  let draft = template.initial(opts);
  const saved = opts.tag || template.needs.length ? await store.getSaved(`${interaction.guild_id}:${template.draftKey(draft)}`) : null;
  if (saved) draft = { ...draft, ...saved };
  else if (template.legacy) {
    const old = await store.getByKey(`${interaction.guild_id}:${template.legacy.key(draft)}`);
    if (old) draft = { ...draft, ...template.legacy.toDraft(old) };
  }
  draft = { ...draft, type, guildId: interaction.guild_id };
  await store.saveDraft(interaction.id, draft);
  return panel(4, interaction.id, template, draft, origin, '', EPHEMERAL);
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
  const more = rest.length ? `\n-# ${rest.length} more below` : '';
  return panel(7, id, template, draft, origin, `**Saved.** ${blocks[0]}${more}`);
}

export async function handleEditorComponent(interaction, env, ctx, origin) {
  const [, action, id, part] = interaction.data.custom_id.split(':');
  const store = routeStore(env);
  const draft = await store.getDraft(id);
  if (!draft) return privately('This editor expired. Run the command again.');
  const template = TEMPLATES[draft.type];

  if (action === 'edit') return new JsonResponse({ type: 9, data: sectionModal(id, template, part, draft) });

  if (action === 'menu') {
    const next = applyMenu(draft, template, part, interaction.data.values);
    await store.saveDraft(id, next);
    return panel(7, id, template, next, origin);
  }

  return save(interaction, env, ctx, origin, id, template, draft);
}

export async function handleEditorModal(interaction, env, origin) {
  const [, id, section] = interaction.data.custom_id.split(':');
  const store = routeStore(env);
  const draft = await store.getDraft(id);
  if (!draft) return privately('This editor expired. Run the command again.');
  const template = TEMPLATES[draft.type];
  const fields = interaction.data.components.flatMap((r) => r.components);
  const next = applyModal(draft, template, section, (key) => fields.find((c) => c.custom_id === key)?.value);
  await store.saveDraft(id, next);
  return panel(7, id, template, next, origin);
}
