import { bannerImage } from '../legStartCard.js';
import { TEST_PREFIX, card, gallery, text, cardOutput } from './common.js';

export const task = {
  id: 'task',
  label: 'Route Info: Task',
  needs: [],
  hint: 'Fill in the tag name and the task description to see the card.',
  initial: ({ tag }) => ({ tagName: tag ?? '', body: '' }),
  draftKey: (d) => (d.tagName ? `task:${d.tagName}` : null),
  ready: (d) => Boolean(d.tagName && d.body),
  menus: () => [],
  sections: () => [
    {
      id: 'task',
      title: 'Task',
      inputs: [
        ['tagName', 'Tag name', 50, true],
        ['body', 'Task description', 2000, true, 'paragraph'],
      ],
    },
  ],
  outputs: (d, origin) => [
    cardOutput({
      key: `task:${d.tagName}`,
      tag: `${TEST_PREFIX}${d.tagName}`,
      label: 'Route Info tag',
      embed: card([gallery(bannerImage(origin)), text(d.body)]),
      title: 'Route Info',
      description: d.body.slice(0, 100),
    }),
  ],
};
