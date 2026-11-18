import { numberToOrdinalWord } from '../tagTemplates.js';
import { bannerImage } from '../legStartCard.js';
import { TEST_PREFIX, card, gallery, text, cardOutput } from './common.js';

export const pitstop = {
  id: 'pitstop',
  label: 'Pit Stop',
  needs: ['leg'],
  hint: 'Fill in the location and season to see the card.',
  initial: ({ leg }) => ({ leg: String(leg), location: '', image: '', season: '4' }),
  draftKey: (d) => `pitstop:l${d.leg}`,
  ready: (d) => Boolean(d.location && d.season),
  menus: () => [],
  sections: () => [
    {
      id: 'pitstop',
      title: 'Pit Stop',
      inputs: [
        ['location', 'Location name', 100, true],
        ['image', 'Location image URL (optional, default is the pit stop map)', 500, false],
        ['season', 'Season number', 10, true],
      ],
    },
  ],
  outputs(d, origin) {
    const ordinal = numberToOrdinalWord(Number(d.leg)).toUpperCase();
    return [
      cardOutput({
        key: `pitstop:l${d.leg}`,
        tag: `${TEST_PREFIX}pitstop-l${d.leg}`,
        label: 'Pit Stop tag',
        embed: card([
          text(`# YOU ARE DONE WITH THE ${ordinal} LEG OF THE AMAZING JRACE: SEASON ${d.season}!`),
          gallery(d.image || bannerImage(origin, 'pit-stop')),
          text(`***Jroe stands beside you at ${d.location}. You are team number...***`),
        ]),
        title: `Pit Stop: Leg ${d.leg}`,
        description: d.location,
      }),
    ];
  },
};
