// Pieces shared by every template: card building blocks and how tags are written out.
import { legTagText } from '../legStartCard.js';

export const CARLBOT_MENTION = '<@235148962103951360>';
// Staging tags all start with this so they never collide with the real ones.
export const TEST_PREFIX = 'test-';

export const text = (content) => ({ type: 10, content });
export const separator = () => ({ type: 14, divider: true, spacing: 2 });
export const gallery = (url) => ({ type: 12, items: [{ media: { url } }] });
export const card = (parts) => ({ component: { type: 17, accent_color: 0xf2c230, components: parts.filter(Boolean) } });

// Outputs a template makes:
//   { kind: 'card', key, tag, label, embed, title, description }  a link card plus its tag
//   { kind: 'tag', tag, label, text }                              a plain Carlbot tag
//   { kind: 'extra', label, text }                                 something else to paste
export const cardOutput = (o) => ({ kind: 'card', ...o });
export const tagOutput = (o) => ({ kind: 'tag', ...o });
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
