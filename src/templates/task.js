import { bannerImage } from '../legStartCard.js';
import { TEST_PREFIX, italic, card, gallery, text, cardOutput } from './common.js';

export const task = {
  id: 'task',
  label: 'Route Info: Task',
  needs: [],
  hint: 'Fill in the tag name and the task description to see the card.',
  initial: ({ tag }) => ({ tagName: tag ?? '', body: '', image: '' }),
  // A short description of a saved clue, for the /edit_clue list.
  describe: (d) => d.body.length > 40 ? `${d.body.slice(0, 40)}…` : d.body,
  draftKey: (d) => (d.tagName ? `task:${d.tagName}` : null),
  ready: (d) => Boolean(d.tagName && d.body),
  menus: () => [],
  sections: () => [
    {
      id: 'task',
      title: 'Task',
      inputs: [
        ['tagName', 'Tag name', 50, true, undefined, 'e.g. dopamine-land'],
        ['body', 'Task description', 2000, true, 'paragraph', 'Full task instructions...'],
        ['image', 'Location image URL (optional)', 500, false, undefined, 'https://www.imageURL.com', 'A picture of the location, shown under the task text. Leave blank for none.'],
      ],
    },
  ],
  outputs: (d, origin) => [
    cardOutput({
      key: `task:${d.tagName}`,
      tag: `${TEST_PREFIX}${d.tagName}`,
      label: 'Route Info tag',
      embed: card([gallery(bannerImage(origin)), text(italic(d.body)), d.image ? gallery(d.image) : null]),
      title: 'Route Info',
      description: d.body.slice(0, 100),
    }),
  ],
};
