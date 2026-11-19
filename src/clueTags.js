import { TEMPLATES } from './templates/index.js';

// The main tag of a saved clue, like test-pitstop-l3, or null if it cannot be worked out.
export function tagOf(draft) {
  const template = TEMPLATES[draft?.type];
  try {
    return template?.ready(draft) ? (template.outputs(draft, '')[0]?.tag ?? null) : null;
  } catch {
    return null;
  }
}

// The tag as typed: with or without the test- prefix, any capitalisation.
export const sameTag = (a, b) => a.toLowerCase().replace(/^test-/, '') === b.toLowerCase().replace(/^test-/, '');

// How a saved clue reads in the /edit_clue list: its leg, kind and what it is about, like
// "Leg 5 · Roadblock · Who wants to climb (Cajón del Maipo)". At most 100 characters.
export function clueLabel(draft) {
  const template = TEMPLATES[draft?.type];
  if (!template) return '';
  const kind = template.label.replace(/^Route Info: /, '');
  const parts = [draft.leg ? `Leg ${draft.leg}` : null, kind, template.describe?.(draft)].filter(Boolean);
  return parts.join(' · ').slice(0, 100);
}
