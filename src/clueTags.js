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
