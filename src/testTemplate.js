import { JsonResponse } from './utils.js';
import { openLegEditor } from './legEditor.js';

// Staging version of the template commands. It shares nothing with /tag_template, and its
// tags are named test-leg-N so they never collide with real ones.
export async function handleTestTemplateCommand(interaction, env, origin) {
  const sub = interaction.data.options?.[0];
  if (sub?.name !== 'routeinfo_legstart') return new JsonResponse({ error: 'Unknown subcommand' }, { status: 400 });
  const leg = String(sub.options.find((o) => o.name === 'leg').value);
  return openLegEditor(interaction, env, origin, leg);
}
