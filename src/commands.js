import { TEMPLATE_CHOICES } from './templates/index.js';

export const TAG_TEMPLATE_COMMAND = {
  name: 'tag_template',
  description: 'Generate a Carlbot tag from a template.',
  default_member_permissions: '32', // MANAGE_GUILD
  options: [
    {
      type: 1,
      name: 'preview_routeinfo',
      description: 'Preview a Route Info built with Components V2 (test only).',
    },
    {
      type: 1,
      name: 'routeinfo_legstart',
      description: 'Generate a Route Info: Leg Start tag.',
      options: [{ type: 4, name: 'leg', description: 'Leg number', required: true }],
    },
    {
      type: 1,
      name: 'routeinfo_task',
      description: 'Generate a Route Info: Task tag.',
      options: [],
    },
    {
      type: 1,
      name: 'routeinfo_travel',
      description: 'Generate a Route Info: Travel tag.',
      options: [],
    },
    {
      type: 1,
      name: 'detour',
      description: 'Generate Detour tags (overview, both options, switch).',
      options: [
        { type: 4, name: 'leg', description: 'Leg number', required: true },
        { type: 3, name: 'switch_time', description: 'Travel time to switch sides (e.g. 10 minutes)', required: false },
      ],
    },
    {
      type: 1,
      name: 'roadblock',
      description: 'Generate a Roadblock tag.',
      options: [],
    },
    {
      type: 1,
      name: 'pitstop',
      description: 'Generate a Pit Stop tag.',
      options: [
        { type: 4, name: 'leg', description: 'Leg number', required: true },
        { type: 4, name: 'season', description: 'Season number', required: true },
      ],
    },
  ],
};

export const HELP_COMMAND = {
  name: 'help',
  description: 'How to use the tag template commands.',
};

export const MINDMELD_COMMAND = {
  name: 'mindmeld',
  description: 'Start a Mind Meld game with a partner.',
  contexts: [0], // guild channels only
  options: [{ type: 6, name: 'partner', description: 'Who you are playing with', required: true }],
};

// Build a clue as a card and tags with an editor. /create_clue makes a new one, /edit_clue
// reopens a saved one by its tag.
export const CREATE_CLUE_COMMAND = {
  name: 'create_clue',
  description: 'Create a new clue as a card and tags.',
  default_member_permissions: '32', // MANAGE_GUILD
  contexts: [0],
  options: [
    { type: 3, name: 'type', description: 'Which kind of clue', required: true, choices: TEMPLATE_CHOICES },
  ],
};

export const EDIT_CLUE_COMMAND = {
  name: 'edit_clue',
  description: 'Change a clue you already saved.',
  default_member_permissions: '32', // MANAGE_GUILD
  contexts: [0],
  options: [{ type: 3, name: 'tag', description: 'The clue\'s tag name', required: true, autocomplete: true }],
};

export const MEMORYPOKER_COMMAND = {
  name: 'memorypoker',
  description: 'Memorize a board of cards and pick the best poker hand. Opens a lobby for two players.',
  contexts: [0], // guild channels only
  options: [{ type: 5, name: 'solo', description: 'Practise alone, privately', required: false }],
};
