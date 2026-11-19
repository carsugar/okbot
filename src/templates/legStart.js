import { parseLegStart, legStartEmbed, bannerImage, mimuAutoresponder, flightParagraph } from '../legStartCard.js';
import { hasLeg, legField, legStartValue, TEST_PREFIX, cardOutput, extraOutput } from './common.js';

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
    flightText: d.flightText ?? '',
  });

export const legStart = {
  id: 'legstart',
  label: 'Route Info: Leg Start',
  needs: [],
  hint: 'Fill in departure, destination and flight duration to see the card.',
  initial: ({ leg }) => ({ leg: legStartValue(leg), depCity: '', depImage: '', destCity: '', site: '', airport: '', money: '', flightTime: '', flightText: '' }),
  // A short description of a saved clue, for the /edit_clue list.
  // Shown in the flight text box until it is changed. Left as it is, the card keeps following
  // the flight duration and destination.
  prefill: (d) => (d.flightTime && d.destCity ? { flightText: flightParagraph(draftToLeg({ ...d, flightText: '' })) } : {}),
  describe: (d) => `${d.depCity} to ${d.destCity}`,
  draftKey: (d) => (hasLeg(d) ? `leg-${d.leg}` : null),
  // Legs saved by the first version of the editor have no stored draft, only the card data.
  legacy: { key: (d) => `leg-${d.leg}`, toDraft: draftFromSaved },
  ready: (d) => hasLeg(d) && Boolean(d.depCity && d.destCity && d.flightTime),
  menus: () => [],
  sections: () => [
    { id: 'leg', title: 'Leg', inputs: [legField] },
    {
      id: 'departure',
      title: 'Departure',
      inputs: [
        ['depCity', 'Departure city, country', 100, true, undefined, 'e.g. Santiago, Chile'],
        ['depImage', 'Image URL (optional)', 500, false, undefined, 'https://www.imageURL.com'],
      ],
    },
    {
      id: 'destination',
      title: 'Destination',
      inputs: [
        ['destCity', 'Destination city, country', 100, true, undefined, 'e.g. Beijing, China'],
        ['site', 'Site to reach (optional)', 100, false, undefined, 'e.g. Temple of Heaven'],
        ['airport', 'Airport (optional)', 100, false, undefined, 'e.g. PEK Airport'],
      ],
    },
    {
      id: 'moneyflight',
      title: 'Money and flight',
      inputs: [
        ['money', 'Leg money (optional)', 20, false, undefined, 'e.g. $15'],
        ['flightTime', 'Flight duration', 100, true, undefined, 'e.g. 3 hours'],
        ['flightText', 'Flight and arrival text (edit to change)', 700, false, 'paragraph', 'Filled in once the flight and destination are set. Change it if this leg is different.'],
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
