// Pure pieces of the Leg Start editor panel: the draft, its section pop-ups and the panel
// message. The draft holds the raw form values so each pop-up can be pre-filled.
import { parseLegStart, legStartEmbed, bannerImage } from './legStartCard.js';
import { embedBytes, MAX_EMBED_BYTES } from './routeEmbedPage.js';

const IS_COMPONENTS_V2 = 1 << 15;

export const BANNERS = [
  { value: 'route-info', label: 'Route Info' },
  { value: 'detour', label: 'Detour' },
  { value: 'roadblock', label: 'Road Block' },
];

// What each section pop-up edits: draft key, label, length, required.
const SECTIONS = {
  departure: {
    title: 'Departure',
    inputs: [
      ['depCity', 'Departure city, country', 100, true],
      ['depImage', 'Image URL (optional)', 500, false],
    ],
  },
  destination: {
    title: 'Destination',
    inputs: [
      ['destCity', 'Destination city, country', 100, true],
      ['site', 'Site to reach (optional)', 100, false],
      ['airport', 'Airport (optional)', 100, false],
    ],
  },
  moneyflight: {
    title: 'Money and flight',
    inputs: [
      ['money', 'Leg money (optional)', 20, false],
      ['flightTime', 'Flight duration, e.g. 3 hours', 100, true],
    ],
  },
};

export const emptyDraft = (guildId, leg) => ({
  guildId, leg, depCity: '', depImage: '', destCity: '', site: '', airport: '', money: '', flightTime: '', banner: 'route-info',
});

export const draftFromSaved = (guildId, d) => ({
  guildId,
  leg: d.leg,
  depCity: d.departure,
  depImage: d.departureImage,
  destCity: d.destination,
  site: d.site,
  airport: d.airport,
  money: d.moneyDisplay,
  flightTime: d.flightTime.replace(/ flight$/, ''),
  banner: d.banner ?? 'route-info',
});

const pipe = (...parts) => parts.join(' | ').replace(/( \| )+$/, '');

export const draftToLeg = (d) => ({
  ...parseLegStart({
    leg: d.leg,
    departure: pipe(d.depCity, ...(d.depImage ? [d.depImage] : [])),
    destination: pipe(d.destCity, d.site, d.airport),
    money: d.money,
    flightTime: d.flightTime,
  }),
  banner: d.banner,
});

export const isReady = (d) => Boolean(d.depCity && d.destCity && d.flightTime);

export function applyModal(draft, section, getField) {
  const next = { ...draft };
  for (const [key] of SECTIONS[section].inputs) next[key] = (getField(key) ?? '').trim();
  return next;
}

export function sectionModal(draftId, section, draft) {
  const { title, inputs } = SECTIONS[section];
  return {
    custom_id: `le_modal:${draftId}:${section}`,
    title: `Leg ${draft.leg}: ${title}`,
    components: inputs.map(([key, label, max_length, required]) => ({
      type: 1,
      components: [{ type: 4, custom_id: key, label, style: 1, max_length, required, ...(draft[key] && { value: draft[key].slice(0, max_length) }) }],
    })),
  };
}

const text = (content) => ({ type: 10, content });
const button = (style, label, custom_id, extra = {}) => ({ type: 2, style, label, custom_id, ...extra });

export function panelData(draftId, draft, origin, status = '') {
  const ready = isReady(draft);
  const card = ready ? legStartEmbed(draftToLeg(draft), bannerImage(origin, draft.banner)) : null;
  const bytes = card ? embedBytes(card) : 0;
  const tooLong = bytes > MAX_EMBED_BYTES;
  const counter = ready
    ? `-# ${bytes} / ${MAX_EMBED_BYTES} bytes${tooLong ? ' ⚠️ too long for a link preview, shorten something' : ''}`
    : '-# Fill in departure, destination and flight duration to see the card.';
  const id = (action) => `le:${action}:${draftId}`;
  return {
    flags: IS_COMPONENTS_V2,
    components: [
      text(`## Leg ${draft.leg} start`),
      ...(card ? [card.component] : []),
      text(counter),
      ...(status ? [text(status)] : []),
      {
        type: 1,
        components: [
          button(2, 'Departure', `${id('edit')}:departure`),
          button(2, 'Destination', `${id('edit')}:destination`),
          button(2, 'Money and flight', `${id('edit')}:moneyflight`),
        ],
      },
      {
        type: 1,
        components: [
          {
            type: 3,
            custom_id: id('banner'),
            placeholder: 'Banner',
            options: BANNERS.map((b) => ({ ...b, ...(b.value === draft.banner && { default: true }) })),
          },
        ],
      },
      { type: 1, components: [button(3, 'Save and get tag', id('save'), ...(!ready || tooLong ? [{ disabled: true }] : []))] },
    ],
  };
}
