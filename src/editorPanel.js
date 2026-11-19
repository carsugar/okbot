// Pure pieces of the template editor panel: the edit pop-ups and the panel message.
// Everything that differs between clue types comes from the template definition.
import { embedBytes, MAX_EMBED_BYTES } from './routeEmbedPage.js';

const IS_COMPONENTS_V2 = 1 << 15;

const text = (content) => ({ type: 10, content });
const button = (style, label, custom_id, extra = {}) => ({ type: 2, style, label, custom_id, ...extra });
const chunk = (items, size) => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, i * size + size));

const INPUTS_PER_MODAL = 5;

// Every text field of the template, in order, split into pop-ups of five (Discord's limit).
export const fieldPages = (template, draft) =>
  chunk(template.sections(draft).flatMap((s) => s.inputs), INPUTS_PER_MODAL);

// The pop-ups of a template, in order. A template with `modalChoice` (Travel's ways to get
// there) puts that group of tick boxes on its first pop-up, after the first `at` text fields.
export const modalPages = (template, draft) => {
  const choice = template.modalChoice;
  const pages = [];
  let flow = [];
  // Text fields run on from section to section, five to a pop-up (four on the first when it
  // also has the tick boxes). A section with `perPage` starts fresh pop-ups of that size, so
  // groups of fields that belong together stay together.
  const flush = () => {
    let rest = flow;
    if (choice && !pages.length) {
      pages.push({ choice, inputs: rest.slice(0, INPUTS_PER_MODAL - 1) });
      rest = rest.slice(INPUTS_PER_MODAL - 1);
    }
    chunk(rest, INPUTS_PER_MODAL).forEach((inputs) => pages.push({ inputs }));
    flow = [];
  };
  for (const section of template.sections(draft)) {
    if (!section.perPage) {
      flow.push(...section.inputs);
      continue;
    }
    flush();
    chunk(section.inputs, section.perPage).forEach((inputs, i) =>
      pages.push({ inputs, pageLabel: section.pageLabel, ...(i === 0 && section.choice && { choice: section.choice }) }));
  }
  flush();
  return pages;
};

const labelled = (label, component, description) => ({ type: 18, label: label.slice(0, 45), ...(description && { description: description.slice(0, 100) }), component });

const textInput = (draft, [key, label, max_length, required, style, placeholder, description], defaults = {}) => {
  // A box can show a default until it is changed.
  const value = draft[key] || defaults[key];
  return labelled(label, {
    type: 4,
    custom_id: key,
    style: style === 'paragraph' ? 2 : 1,
    max_length,
    required,
    ...(placeholder && { placeholder: placeholder.slice(0, 100) }),
    ...(value && { value: String(value).slice(0, max_length) }),
  }, description);
};

const choiceBoxes = (draft, choice) =>
  labelled(choice.label, {
    type: 22,
    custom_id: choice.key,
    required: false,
    min_values: 0,
    max_values: choice.options.length,
    options: choice.options.map((o) => ({ label: o.label, value: o.value, default: (draft[choice.key] ?? []).includes(o.value) })),
  });

export function editModal(draftId, template, page, draft) {
  const pages = modalPages(template, draft);
  const at = pages[page] ? page : 0;
  const { inputs, choice } = pages[at];
  const defaults = template.prefill?.(draft) ?? {};
  const fields = inputs.map((input) => textInput(draft, input, defaults));
  if (choice) fields.splice(choice.at, 0, choiceBoxes(draft, choice));
  return {
    custom_id: `le_modal:${draftId}:${at}`,
    title: `${template.label}${pages.length > 1 ? ` (${at + 1}/${pages.length})` : ''}`.slice(0, 45),
    components: fields,
  };
}

// `getField(key)` gives a text field's value, or the list of values ticked in a choice.
export function applyModal(draft, template, page, getField) {
  const next = { ...draft };
  const current = modalPages(template, draft)[page];
  if (current?.choice) next[current.choice.key] = getField(current.choice.key) ?? [];
  // A box left showing its default is not an override, so it keeps following the other fields.
  const defaults = template.prefill?.(draft) ?? {};
  for (const [key] of current?.inputs ?? []) {
    const value = (getField(key) ?? '').trim();
    next[key] = value === (defaults[key] ?? null) ? '' : value;
  }
  return next;
}

export function applyMenu(draft, template, menuId, values) {
  const menu = template.menus(draft).find((m) => m.id === menuId);
  return { ...draft, [menu.key]: menu.multi ? values : values[0] };
}

const stepName = (page, i, template, draft) => {
  const own = typeof page.pageLabel === 'function' ? page.pageLabel(draft) : page.pageLabel;
  return own ?? (i === 0 ? 'Details' : (template.extraPageLabel ?? 'More details'));
};

// `status` is a short message above the steps; `saved` is the text of a save (what to copy),
// shown at the very bottom below everything else.
export function panelData(draftId, template, draft, origin, status = '', saved = '') {
  const ready = template.ready(draft);
  const outputs = ready ? template.outputs(draft, origin) : [];
  const cards = outputs.filter((o) => o.kind === 'card');
  const bytes = Math.max(0, ...cards.map((c) => embedBytes(c.embed)));
  const tooLong = bytes > MAX_EMBED_BYTES;
  const also = outputs.slice(1).map((o) => o.label);
  const counter = ready
    ? `-# ${bytes} / ${MAX_EMBED_BYTES} bytes${tooLong ? ' ⚠️ too long for a link preview, shorten something' : ''}` +
      (also.length ? `\n-# Also makes: ${also.join(', ')}` : '')
    : `-# ${template.hint}`;
  const id = (action) => `le:${action}:${draftId}`;

  // One row per step: what to do on the left, its button on the right. The blue button is the
  // one to press now; Save comes last and unlocks once every required step is done.
  const pages = modalPages(template, draft);
  const pending = template.pending?.(draft) ?? null;
  const steps = template.steps?.(draft) ?? pages.map((page, i) => ({
    label: stepName(page, i, template, draft),
    detail: page.inputs.map((f) => f[1].replace(/ \(optional\)$/, '')).join(', '),
    done: page.inputs.filter((f) => f[3]).every(([key]) => draft[key]) && (page.inputs.some((f) => f[3]) || Boolean(draft.touched)),
  }));
  const now = steps.findIndex((st) => !st.done && !st.optional);
  const canSave = ready && !tooLong && !pending && now < 0;
  const section = (content, accessory) => ({ type: 9, components: [text(content)], accessory });
  const stepRows = steps.map((st, i) => {
    const mark = st.done ? '✅' : i === now ? '👉' : st.optional ? '➖' : '⬜';
    const detail = st.detail ? `\n-# ${st.detail}` : '';
    const verb = st.done ? 'Edit' : st.optional ? 'Customize' : 'Fill in';
    return section(`${mark} **${i + 1}. ${st.label}**${st.optional && !st.done ? ' (optional)' : ''}${detail}`, button(i === now || pending?.page === i ? 1 : 2, verb, `${id('edit')}:${i}`));
  });
  const saveRow = section(
    `${canSave ? '👉' : '⬜'} **${steps.length + 1}. Save**\n-# Gives you the tag to copy and paste yourself.`,
    button(3, 'Save', id('save'), ...(canSave ? [] : [{ disabled: true }])),
  );
  const instruction = canSave ? '**All set.** Press **Save** at the bottom.' : now >= 0 || pending ? '**Go down the list.** Press the blue button.' : '';
  const menuRows = template.menus(draft).map((m) => ({
    type: 1,
    components: [
      {
        type: 3,
        custom_id: `${id('menu')}:${m.id}`,
        placeholder: m.placeholder,
        min_values: m.multi ? 0 : 1,
        max_values: m.multi ? m.options.length : 1,
        options: m.options.map((o) => ({ ...o, ...(m.selected.includes(o.value) && { default: true }) })),
      },
    ],
  }));

  return {
    flags: IS_COMPONENTS_V2,
    components: [
      text(`## ${template.label}${draft.leg ? ` · Leg ${draft.leg}` : ''}`),
      ...(cards[0] ? [cards[0].embed.component] : []),
      text(counter),
      ...(status ? [text(status)] : []),
      ...(instruction ? [text(instruction)] : []),
      ...stepRows,
      ...menuRows,
      saveRow,
      ...(saved ? [text(saved)] : []),
    ],
  };
}
