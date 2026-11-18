import { bannerImage } from '../legStartCard.js';
import { TEST_PREFIX, card, gallery, text, separator, cardOutput, tagOutput, initialsOf } from './common.js';

export const roadblock = {
  id: 'roadblock',
  label: 'Roadblock',
  needs: ['leg'],
  hint: 'Fill in the title, location and clue to see the card.',
  initial: ({ leg }) => ({ leg: String(leg), title: '', location: '', image: '', clue: '' }),
  draftKey: (d) => `roadblock:l${d.leg}`,
  ready: (d) => Boolean(d.title && d.location && d.clue),
  menus: () => [],
  sections: () => [
    {
      id: 'details',
      title: 'Title and location',
      inputs: [
        ['title', 'Roadblock title', 100, true],
        ['location', 'Location name', 100, true],
        ['image', 'Location image URL (optional)', 500, false],
      ],
    },
    { id: 'clue', title: 'Clue', inputs: [['clue', 'Roadblock clue text', 2000, true, 'paragraph']] },
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
          text(`### ROADBLOCK: ${title}`),
          text(`Welcome to **${d.location}**!`),
          d.image ? gallery(d.image) : null,
          separator(),
          text(`If you are competing in this roadblock, use the command \`${clueCmd}\` for further details!`),
          text('Remember the limit for each partner with the amount of roadblocks each can do!'),
        ]),
        title: `Roadblock: ${d.title}`,
        description: d.location,
      }),
      tagOutput({ tag: `${TEST_PREFIX}rb-l${d.leg}`, label: `Roadblock clue (\`${clueCmd}\`)`, text: d.clue }),
    ];
  },
};
