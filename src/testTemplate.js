import { openEditor } from './editor.js';

// Staging version of the template commands: one command, a type choice, and the editor panel.
// It shares nothing with /tag_template, and its tags are named test-... so they never collide
// with real ones.
export async function handleTestTemplateCommand(interaction, env, origin) {
  const options = interaction.data.options ?? [];
  // The first version of this command was a subcommand per type; keep it working until the
  // command is registered again.
  const sub = options.find((o) => o.type === 1);
  if (sub) {
    const leg = sub.options?.find((o) => o.name === 'leg')?.value;
    return openEditor(interaction, env, origin, 'legstart', { leg });
  }
  const get = (name) => options.find((o) => o.name === name)?.value;
  return openEditor(interaction, env, origin, get('type'), { leg: get('leg'), tag: get('tag') });
}
