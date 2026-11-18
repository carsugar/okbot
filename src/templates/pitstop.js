import { numberToOrdinalWord } from '../tagTemplates.js';
import { TEST_PREFIX, card, gallery, text, cardOutput } from './common.js';

export const pitstop = {
  id: 'pitstop',
  label: 'Pit Stop',
  needs: ['leg'],
  hint: 'Fill in the location and season to see the card.',
  initial: ({ leg }) => ({ leg: String(leg), location: '', image: '', season: '' }),
  draftKey: (d) => `pitstop:l${d.leg}`,
  ready: (d) => Boolean(d.location && d.season),
  menus: () => [],
  sections: () => [
    {
      id: 'pitstop',
      title: 'Pit Stop',
      inputs: [
        ['location', 'Location name', 100, true],
        ['image', 'Location image URL (optional)', 500, false],
        ['season', 'Season number', 10, true],
      ],
    },
  ],
  outputs(d) {
    const ordinal = numberToOrdinalWord(Number(d.leg)).toUpperCase();
    return [
      cardOutput({
        key: `pitstop:l${d.leg}`,
        tag: `${TEST_PREFIX}pitstop-l${d.leg}`,
        label: 'Pit Stop tag',
        embed: card([
          text(`# YOU ARE DONE WITH THE ${ordinal} LEG OF THE AMAZING JRACE: SEASON ${d.season}!`),
          d.image ? gallery(d.image) : null,
          text(`***Jroe stands beside you at ${d.location}. You are team number...***`),
        ]),
        title: `Pit Stop: Leg ${d.leg}`,
        description: d.location,
      }),
    ];
  },
};
