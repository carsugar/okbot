// Pure pieces of the template editor panel: the section pop-ups and the panel message.
// Everything that differs between clue types comes from the template definition.
import { embedBytes, MAX_EMBED_BYTES } from './routeEmbedPage.js';

const IS_COMPONENTS_V2 = 1 << 15;
const BUTTONS_PER_ROW = 5;

const text = (content) => ({ type: 10, content });
const button = (style, label, custom_id, extra = {}) => ({ type: 2, style, label, custom_id, ...extra });
const chunk = (items, size) => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, i * size + size));

export function sectionModal(draftId, template, sectionId, draft) {
  const section = template.sections(draft).find((s) => s.id === sectionId);
  return {
    custom_id: `le_modal:${draftId}:${sectionId}`,
    title: `${template.label}: ${section.title}`.slice(0, 45),
    components: section.inputs.map(([key, label, max_length, required, style]) => ({
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

export function applyModal(draft, template, sectionId, getField) {
  const section = template.sections(draft).find((s) => s.id === sectionId);
  const next = { ...draft };
  for (const [key] of section.inputs) next[key] = (getField(key) ?? '').trim();
  return next;
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

  const sectionRows = chunk(template.sections(draft), BUTTONS_PER_ROW).map((group) => ({
    type: 1,
    components: group.map((s) => button(2, s.title.slice(0, 80), `${id('edit')}:${s.id}`)),
  }));
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
      ...sectionRows,
      ...menuRows,
      { type: 1, components: [button(3, 'Save and get tag', id('save'), ...(!ready || tooLong ? [{ disabled: true }] : []))] },
    ],
  };
}
