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

const routeDone = (d) => Boolean(hasLeg(d) && d.depCity && d.destCity);

export const legStart = {
  id: 'legstart',
  label: 'Route Info: Leg Start',
  needs: [],
  hint: 'Fill in departure, destination and flight duration to see the card.',
  initial: ({ leg }) => ({ leg: legStartValue(leg), depCity: '', depImage: '', destCity: '', site: '', airport: '', money: '', flightTime: '', flightText: '' }),
  // Shown in the flight text box until it is changed. Left as it is, the card keeps following
  // the flight duration and destination.
  prefill: (d) => (d.flightTime && d.destCity ? { flightText: flightParagraph(draftToLeg({ ...d, flightText: '' })) } : {}),
  // A short description of a saved clue, for the /edit_clue list.
  describe: (d) => `${d.depCity} to ${d.destCity}`,
  draftKey: (d) => (hasLeg(d) ? `leg-${d.leg}` : null),
  // Legs saved by the first version of the editor have no stored draft, only the card data.
  legacy: { key: (d) => `leg-${d.leg}`, toDraft: draftFromSaved },
  ready: (d) => hasLeg(d) && Boolean(d.depCity && d.destCity && d.flightTime),
  menus: () => [],
  // Three steps: where from and to, the flight and money, then (optional) the flight text.
  steps: (d) => [
    { label: 'Departure & destination', detail: 'Leg number, departure, destination, site', done: routeDone(d) },
    { label: 'Airport, money & flight', detail: 'Airport, money, flight time', done: Boolean(d.flightTime) },
    {
      label: 'Customize text',
      optional: true,
      done: Boolean(d.flightText),
      detail: d.flightText
        ? 'Using your own wording.'
        : d.flightTime && d.destCity
          ? `Usual text: ${flightParagraph(draftToLeg(d)).replace(/\s+/g, ' ')}`
          : 'The usual flight text shows here once steps 1 and 2 are filled in.',
    },
  ],
  sections: () => [
    {
      id: 'route',
      title: 'Departure & destination',
      perPage: 5,
      pageLabel: 'Departure & destination',
      inputs: [
        legField,
        ['depCity', 'Departure city, country', 100, true, undefined, 'e.g. Santiago, Chile'],
        ['depImage', 'Departure image URL (optional)', 500, false, undefined, 'https://www.imageURL.com'],
        ['destCity', 'Destination city, country', 100, true, undefined, 'e.g. Beijing, China'],
        ['site', 'Site to reach (optional)', 100, false, undefined, 'e.g. Temple of Heaven'],
      ],
    },
    {
      id: 'flight',
      title: 'Airport, money & flight',
      perPage: 3,
      pageLabel: 'Airport, money & flight',
      inputs: [
        ['airport', 'Airport (optional)', 100, false, undefined, 'e.g. PEK Airport'],
        ['money', 'Leg money (optional)', 20, false, undefined, 'e.g. $15'],
        ['flightTime', 'Flight duration', 100, true, undefined, 'e.g. 3 hours'],
      ],
    },
    {
      id: 'text',
      title: 'Customize text',
      perPage: 1,
      pageLabel: 'Customize text',
      inputs: [
        ['flightText', 'Flight and arrival text', 700, false, 'paragraph', 'Filled in with the usual text once the flight and destination are set.', 'Change the wording for this leg. Clear the box to go back to the usual text.'],
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
