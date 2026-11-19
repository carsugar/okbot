// Pieces shared by every template: card building blocks and how tags are written out.
import { legTagText, accentFor } from '../legStartCard.js';

export const CARLBOT_MENTION = '<@235148962103951360>';
// Tags used to start with test- while staging. Now they are the real names.
export const TEST_PREFIX = '';

export const text = (content) => ({ type: 10, content });
// Leg-based templates ask for the leg number in the pop-up, as its first field.
export const hasLeg = (d) => /^\d+$/.test(d.leg ?? '');
export const legField = ['leg', 'Leg number', 3, true, undefined, 'e.g. 10'];
export const legStartValue = (leg) => (leg === undefined ? '' : String(leg));
export const separator = () => ({ type: 14, divider: true, spacing: 2 });
export const gallery = (url) => ({ type: 12, items: [{ media: { url } }] });
export const card = (parts) => ({ component: { type: 17, accent_color: accentFor(parts), components: parts.filter(Boolean) } });

// Outputs a template makes:
//   { kind: 'card', key, tag, label, embed, title, description }  a link card plus its tag
//   { kind: 'tag', tag, label, text }                              a plain Carlbot tag
//   { kind: 'extra', label, text }                                 something else to paste
// A tag name is one word to Carlbot, so spaces become hyphens.
export const tagSlug = (name) => name.trim().replace(/\s+/g, '-').replace(/-{2,}/g, '-');
const slugged = (o) => (o.tag ? { ...o, tag: tagSlug(o.tag) } : o);
export const cardOutput = (o) => ({ kind: 'card', ...slugged(o) });
export const tagOutput = (o) => ({ kind: 'tag', ...slugged(o) });
export const extraOutput = (o) => ({ kind: 'extra', ...o });

export const plainTag = (tag, content) => `${CARLBOT_MENTION} tag + ${tag} ${content}`;

// The text shown to the person for one output, once any cards are saved (urls by key).
export function outputBlock(output, url) {
  const code = (body) => `\`\`\`\n${body}\n\`\`\``;
  if (output.kind === 'card') {
    const body = legTagText({ carlbotMention: CARLBOT_MENTION, tagName: output.tag, url });
    return `**${output.label} (\`!${output.tag}\`)**\n${code(body)}\nPreview: ${url}`;
  }
  if (output.kind === 'tag') return `**${output.label} (\`!${output.tag}\`)**\n${code(plainTag(output.tag, output.text))}`;
  return `**${output.label}**\n${code(output.text)}`;
}

export const initialsOf = (name) => name.split(/\s+/).filter(Boolean).map((w) => w[0]).join('');
