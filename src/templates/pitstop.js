import { numberToOrdinalWord } from '../tagTemplates.js';
import { bannerImage } from '../legStartCard.js';
import { hasLeg, legField, legStartValue, TEST_PREFIX, card, gallery, text, cardOutput } from './common.js';

export const pitstop = {
  id: 'pitstop',
  label: 'Pit Stop',
  needs: [],
  hint: 'Fill in the location and season to see the card.',
  initial: ({ leg }) => ({ leg: legStartValue(leg), location: '', image: '', season: '4' }),
  draftKey: (d) => (hasLeg(d) ? `pitstop:l${d.leg}` : null),
  ready: (d) => hasLeg(d) && Boolean(d.location && d.season),
  menus: () => [],
  sections: () => [
    { id: 'leg', title: 'Leg', inputs: [legField] },
    {
      id: 'pitstop',
      title: 'Pit Stop',
      inputs: [
        ['location', 'Location name', 100, true, undefined, 'e.g. Embalse Yeso'],
        ['image', 'Location image URL (optional)', 500, false, undefined, 'https://www.imageURL.com'],
        ['season', 'Season number', 10, true, undefined, 'e.g. 4'],
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
          d.image ? gallery(d.image) : null,
          gallery(bannerImage(origin, 'pit-stop')),
          text(`***Jroe stands beside you at ${d.location}. You are team number...***`),
        ]),
        title: `Pit Stop: Leg ${d.leg}`,
        description: d.location,
      }),
    ];
  },
};
