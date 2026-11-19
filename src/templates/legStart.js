import { parseLegStart, legStartEmbed, bannerImage, mimuAutoresponder, flightParagraph } from '../legStartCard.js';
import { TRANSPORTS, cap, transportsOf, parseTimeCost, touchdownOutputs } from './travel.js';
import { humanJoin } from '../tagTemplates.js';
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

const missingTimes = (d) => transportsOf(d).filter((t) => !parseTimeCost(d[`t_${t}`]).time);
const siteDone = (d) => Boolean(d.site && transportsOf(d).length);

export const legStart = {
  id: 'legstart',
  label: 'Route Info: Leg Start',
  needs: [],
  hint: 'Fill in the steps below to see the card.',
  initial: ({ leg }) => ({ leg: legStartValue(leg), depCity: '', depImage: '', destCity: '', site: '', airport: '', money: '', flightTime: '', flightText: '', airportImage: '', custom: '', extra: '', transports: [] }),
  // Shown in the flight text box until it is changed. Left as it is, the card keeps following
  // the flight duration and destination.
  prefill: (d) => (d.flightTime && d.destCity ? { flightText: flightParagraph(draftToLeg({ ...d, flightText: '' })) } : {}),
  // A short description of a saved clue, for the /edit_clue list.
  describe: (d) => `${d.depCity} to ${d.destCity}`,
  draftKey: (d) => (hasLeg(d) ? `leg-${d.leg}` : null),
  // Legs saved by the first version of the editor have no stored draft, only the card data.
  legacy: { key: (d) => `leg-${d.leg}`, toDraft: draftFromSaved },
  ready: (d) => hasLeg(d) && Boolean(d.depCity && d.destCity && d.airport && d.flightTime) && siteDone(d),
  menus: () => [],
  // In order: where from and to, the airport and flight, then the site and how to get there from
  // the airport (that also makes the touchdown card), its times and costs, and the optional text.
  steps: (d) => [
    { label: 'Departure & destination', detail: 'Leg number, departure city, departure image, destination city', done: Boolean(hasLeg(d) && d.depCity && d.destCity) },
    { label: 'Airport, money & flight', detail: 'Airport, airport image, money, flight duration', done: Boolean(d.airport && d.flightTime) },
    { label: 'Site & ways to get there', detail: 'Site to reach, tick the ways to get there from the airport', done: siteDone(d) },
    ...(transportsOf(d).length ? [{ label: 'Times and costs', detail: 'How long and how much for each way', done: !missingTimes(d).length }] : []),
    {
      label: 'Customize text',
      optional: true,
      done: Boolean(d.flightText),
      detail: d.flightText
        ? 'Using your own wording.'
        : d.flightTime && d.destCity
          ? `Usual text: ${flightParagraph(draftToLeg(d)).replace(/\s+/g, ' ')}`
          : 'The usual flight text shows here once the flight and destination are filled in.',
    },
  ],
  // Each way to get there needs its time (and cost) before saving.
  pending: (d) => {
    const missing = missingTimes(d);
    return missing.length ? { page: 3, message: `enter the time for ${humanJoin(missing)}.` } : null;
  },
  sections: (d) => [
    {
      id: 'route',
      title: 'Departure & destination',
      perPage: 4,
      pageLabel: 'Departure & destination',
      inputs: [
        legField,
        ['depCity', 'Departure city, country', 100, true, undefined, 'e.g. Santiago, Chile'],
        ['depImage', 'Departure image URL (optional)', 500, false, undefined, 'https://www.imageURL.com'],
        ['destCity', 'Destination city, country', 100, true, undefined, 'e.g. Beijing, China'],
      ],
    },
    {
      id: 'flight',
      title: 'Airport, money & flight',
      perPage: 4,
      pageLabel: 'Airport, money & flight',
      inputs: [
        ['airport', 'Airport name', 100, true, undefined, 'e.g. PEK Airport'],
        ['airportImage', 'Airport image URL (optional)', 500, false, undefined, 'https://www.imageURL.com', 'The airport name links to this picture on the touchdown card. Leave blank for no link.'],
        ['money', 'Leg money (optional)', 20, false, undefined, 'e.g. $15'],
        ['flightTime', 'Flight duration', 100, true, undefined, 'e.g. 3 hours'],
      ],
    },
    {
      id: 'site',
      title: 'Site & ways to get there',
      perPage: 3,
      pageLabel: 'Site & ways to get there',
      choice: { key: 'transports', label: 'Ways to get there from the airport', options: TRANSPORTS, at: 1 },
      inputs: [
        ['site', 'Site to reach', 100, true, undefined, 'e.g. Temple of Heaven'],
        ['custom', 'Custom transport name (if ticked)', 50, false, undefined, 'e.g. tuk tuk, railcar'],
        ['extra', 'Extra travel info (optional)', 1000, false, 'paragraph', 'Additional travel information, warnings, etc...'],
      ],
    },
    ...(transportsOf(d).length
      ? [{
          id: 'costs',
          title: 'Times and costs',
          perPage: 5,
          pageLabel: 'Times and costs',
          inputs: transportsOf(d).map((t) => [`t_${t}`, `${cap(t)}: time, cost`, 150, false, undefined, 'e.g. 40 to 50 minutes, $20']),
        }]
      : []),
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
      ...touchdownOutputs(d, origin),
      ...(autoresponder ? [extraOutput({ label: `Mimu autoresponder: \`${data.moneyCommand}\``, text: autoresponder })] : []),
    ];
  },
};
