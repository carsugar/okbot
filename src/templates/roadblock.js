import { bannerImage } from '../legStartCard.js';
import { hasLeg, legField, legStartValue, TEST_PREFIX, card, gallery, text, separator, cardOutput, initialsOf } from './common.js';

export const roadblock = {
  id: 'roadblock',
  label: 'Roadblock',
  needs: [],
  hint: 'Fill in the title, location and clue to see the card.',
  initial: ({ leg }) => ({ leg: legStartValue(leg), title: '', location: '', image: '', clue: '' }),
  // A short description of a saved clue, for the /edit_clue list.
  describe: (d) => `${d.title} (${d.location})`,
  draftKey: (d) => (hasLeg(d) ? `roadblock:l${d.leg}` : null),
  ready: (d) => hasLeg(d) && Boolean(d.title && d.location && d.clue),
  menus: () => [],
  sections: () => [
    { id: 'leg', title: 'Leg', inputs: [legField] },
    {
      id: 'details',
      title: 'Title and location',
      inputs: [
        ['title', 'Roadblock title', 100, true, undefined, 'e.g. WHO IS TRYNA CRASH OUT?'],
        ['location', 'Location name', 100, true, undefined, 'e.g. Cajon de Maipo'],
        ['image', 'Location image URL (optional)', 500, false, undefined, 'https://www.imageURL.com'],
      ],
    },
    { id: 'clue', title: 'Clue', inputs: [['clue', 'Roadblock clue text', 2000, true, 'paragraph', 'Paste the full clue description here...']] },
  ],
  outputs(d, origin) {
    const title = d.title.toUpperCase();
    const arrivedTag = `${initialsOf(d.location).toLowerCase()}-arrived`;
    const clueCmd = `!RB-L${d.leg}`;
    return [
      cardOutput({
        key: `roadblock:l${d.leg}`,
        tag: `${TEST_PREFIX}${arrivedTag}`,
        label: 'Arrival announcement',
        embed: card([
          gallery(bannerImage(origin, 'roadblock')),
          text(`Welcome to **${d.location}**!`),
          text(`### ${title}`),
          d.image ? gallery(d.image) : null,
          separator(),
          text(`If you are competing in this roadblock, use the command \`${clueCmd}\` for further details!`),
          text('Remember the limit for the number of roadblocks each partner can do!'),
        ]),
        title: `Roadblock: ${d.title}`,
        description: d.location,
      }),
      cardOutput({
        key: `roadblock:l${d.leg}:clue`,
        tag: `${TEST_PREFIX}rb-l${d.leg}`,
        label: `Roadblock clue (\`${clueCmd}\`)`,
        embed: card([gallery(bannerImage(origin, 'roadblock')), text(`### ${title}`), text(d.clue)]),
        title: `Roadblock: ${d.title}`,
        description: d.location,
      }),
    ];
  },
};
