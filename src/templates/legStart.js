import { parseLegStart, legStartEmbed, bannerImage, mimuAutoresponder } from '../legStartCard.js';
import { TEST_PREFIX, cardOutput, extraOutput } from './common.js';

const pipe = (...parts) => parts.join(' | ').replace(/( \| )+$/, '');

// The saved card data a leg had before drafts were stored, turned back into form values.
const draftFromSaved = (d) => ({
  leg: d.leg,
  depCity: d.departure,
  depImage: d.departureImage,
  destCity: d.destination,
  site: d.site,
  airport: d.airport,
  money: d.moneyDisplay,
  flightTime: d.flightTime.replace(/ flight$/, ''),
});

export const draftToLeg = (d) =>
  parseLegStart({
    leg: d.leg,
    departure: pipe(d.depCity, ...(d.depImage ? [d.depImage] : [])),
    destination: pipe(d.destCity, d.site, d.airport),
    money: d.money,
    flightTime: d.flightTime,
  });

export const legStart = {
  id: 'legstart',
  label: 'Route Info: Leg Start',
  needs: ['leg'],
  hint: 'Fill in departure, destination and flight duration to see the card.',
  initial: ({ leg }) => ({ leg: String(leg), depCity: '', depImage: '', destCity: '', site: '', airport: '', money: '', flightTime: '' }),
  draftKey: (d) => `leg-${d.leg}`,
  // Legs saved by the first version of the editor have no stored draft, only the card data.
  legacy: { key: (d) => `leg-${d.leg}`, toDraft: draftFromSaved },
  ready: (d) => Boolean(d.depCity && d.destCity && d.flightTime),
  menus: () => [],
  sections: () => [
    {
      id: 'departure',
      title: 'Departure',
      inputs: [
        ['depCity', 'Departure city, country', 100, true],
        ['depImage', 'Image URL (optional)', 500, false],
      ],
    },
    {
      id: 'destination',
      title: 'Destination',
      inputs: [
        ['destCity', 'Destination city, country', 100, true],
        ['site', 'Site to reach (optional)', 100, false],
        ['airport', 'Airport (optional)', 100, false],
      ],
    },
    {
      id: 'moneyflight',
      title: 'Money and flight',
      inputs: [
        ['money', 'Leg money (optional)', 20, false],
        ['flightTime', 'Flight duration, e.g. 3 hours', 100, true],
      ],
    },
  ],
  outputs(d, origin) {
    const data = draftToLeg(d);
    const autoresponder = mimuAutoresponder(data);
    return [
      cardOutput({
        key: `leg-${d.leg}`,
        tag: `${TEST_PREFIX}leg-${d.leg}`,
        label: 'Leg Start tag',
        embed: legStartEmbed(data, bannerImage(origin)),
        title: `Route Info: Leg ${d.leg} Start`,
        description: `${data.departure} to ${data.destination}`,
      }),
      ...(autoresponder ? [extraOutput({ label: `Mimu autoresponder: \`${data.moneyCommand}\``, text: autoresponder })] : []),
    ];
  },
};
