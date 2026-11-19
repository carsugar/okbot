import { openEditor, editSaved, tagSuggestions } from './editor.js';

// /create_clue starts a new clue of any type; /edit_clue reopens a saved one by its tag.
export function handleCreateClueCommand(interaction, env, origin) {
  const get = (name) => interaction.data.options?.find((o) => o.name === name)?.value;
  return openEditor(interaction, env, origin, get('type'), { leg: get('leg') });
}

export function handleEditClueCommand(interaction, env, origin) {
  const tag = interaction.data.options?.find((o) => o.name === 'tag')?.value;
  return editSaved(interaction, env, origin, tag);
}

export const handleClueAutocomplete = (interaction, env) => tagSuggestions(interaction, env);
