export const TAG_TEMPLATE_COMMAND = {
  name: 'tag_template',
  description: 'Generate a Carlbot tag from a template.',
  default_member_permissions: '32', // MANAGE_GUILD
  options: [
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
  ],
};
