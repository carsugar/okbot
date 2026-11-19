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

export function editModal(draftId, template, page, draft) {
  const pages = fieldPages(template, draft);
  const inputs = pages[page] ?? pages[0];
  return {
    custom_id: `le_modal:${draftId}:${pages[page] ? page : 0}`,
    title: `${template.label}${pages.length > 1 ? ` (${page + 1}/${pages.length})` : ''}`.slice(0, 45),
    components: inputs.map(([key, label, max_length, required, style]) => ({
      type: 1,
      components: [
        {
          type: 4,
          custom_id: key,
          label: label.slice(0, 45),
          style: style === 'paragraph' ? 2 : 1,
          max_length,
          required,
          ...(draft[key] && { value: String(draft[key]).slice(0, max_length) }),
        },
      ],
    })),
  };
}

export function applyModal(draft, template, page, getField) {
  const next = { ...draft };
  for (const [key] of fieldPages(template, draft)[page] ?? []) next[key] = (getField(key) ?? '').trim();
  return next;
}

const isBlank = (v) => v === undefined || v === '' || (Array.isArray(v) && !v.length);

// A draft with every blank field filled in from `saved`; what is already typed wins.
export const fillBlanks = (draft, saved) =>
  Object.fromEntries(Object.entries({ ...saved, ...draft }).map(([k, v]) => [k, isBlank(v) ? (saved[k] ?? v) : v]));

// A press on one of a menu's toggle buttons: the value is switched on or off.
export function applyToggle(draft, template, menuId, value) {
  const menu = template.menus(draft).find((m) => m.id === menuId);
  const now = draft[menu.key] ?? [];
  return { ...draft, [menu.key]: now.includes(value) ? now.filter((v) => v !== value) : [...now, value] };
}

export function applyMenu(draft, template, menuId, values) {
  const menu = template.menus(draft).find((m) => m.id === menuId);
  return { ...draft, [menu.key]: menu.multi ? values : values[0] };
}

export function panelData(draftId, template, draft, origin, status = '') {
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

  const pages = fieldPages(template, draft);
  const editLabel = (i) => (pages.length === 1 ? 'Edit' : i === 0 ? 'Edit details' : i === 1 ? 'More details' : `More details ${i}`);
  const editButtons = pages.map((_, i) => button(2, editLabel(i), `${id('edit')}:${i}`));
  const buttonRow = (m) => ({
    type: 1,
    components: m.options.map((o) => button(m.selected.includes(o.value) ? 3 : 2, o.label, `${id('toggle')}:${m.id}:${o.value}`)),
  });
  const menuRows = template.menus(draft).map((m) => m.buttons ? buttonRow(m) : ({
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
      ...menuRows,
      { type: 1, components: [...editButtons, button(3, 'Save and get tag to copy', id('save'), ...(!ready || tooLong ? [{ disabled: true }] : []))] },
    ],
  };
}
