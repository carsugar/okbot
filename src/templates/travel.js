import { bannerImage } from '../legStartCard.js';
import { humanJoin, getInitials, travelCmdSuffix, travelVerb, buildIndividualCommand, TRAVEL_EMOJIS, TRAVEL_DURATION_LABELS } from '../tagTemplates.js';
import { TEST_PREFIX, card, gallery, text, separator, cardOutput, extraOutput } from './common.js';

export const TRANSPORTS = [
  { value: 'taxi', label: '🚕 Taxi' },
  { value: 'bus', label: '🚌 Bus' },
  { value: 'walking', label: '🚶 Walking' },
  { value: 'custom', label: '✏️ Custom' },
];
export const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// The chosen transports, then the custom one if there is one. Costs are asked for at most five.
export const transportsOf = (d) => {
  const picked = d.transports ?? [];
  return [...picked.filter((t) => t !== 'custom'), ...(picked.includes('custom') && d.custom ? [d.custom] : [])].slice(0, 5);
};

// What the box for one transport holds: the time, then the cost after a comma, like
// "40 to 50 minutes, $20". The last part counts as the cost only if it looks like one ($20,
// 20, free), so a time such as "1 hour, 20 min" stays whole. Boxes saved earlier used "|".
const COST = /^(free|[$€£¥]?\s?\d+([.,]\d+)?\s?(usd|eur|gbp)?)$/i;
export function parseTimeCost(raw = '') {
  if (raw.includes('|')) {
    const [time, cost = ''] = raw.split('|').map((s) => s.trim());
    return { time, cost };
  }
  const at = raw.lastIndexOf(',');
  const last = at < 0 ? '' : raw.slice(at + 1).trim();
  if (at >= 0 && COST.test(last)) return { time: raw.slice(0, at).trim(), cost: last };
  return { time: raw.trim(), cost: '' };
}

// Each transport's time and cost, most expensive first. A cost saved in its own box
// (an earlier version of the editor) wins over one in the same box as the time.
function entriesOf(d) {
  return transportsOf(d)
    .map((option) => {
      const { time: duration, cost: inline } = parseTimeCost(d[`t_${option}`]);
      const cost = (d[`c_${option}`] ?? '').trim() || inline;
      if (!duration) return null;
      return { option, duration, cost, costVal: parseFloat(cost.replace(/[^0-9.]/g, '') || '0') };
    })
    .filter(Boolean)
    .sort((a, b) => b.costVal - a.costVal);
}

export const travel = {
  id: 'travel',
  label: 'Route Info: Travel',
  needs: [],
  // The ways to get there are tick boxes on the first pop-up, after tag name, destination and extra.
  modalChoice: { key: 'transports', label: 'Ways to get there', options: TRANSPORTS, at: 3 },
  hint: 'Fill in the tag name to see the card.',
  extraPageLabel: 'Times and costs',
  steps: (d) => [
    { label: 'Details', done: Boolean(d.tagName) },
    ...(d.dest && transportsOf(d).length ? [{ label: 'Times and costs', done: !travel.pending(d) }] : []),
  ],
  // With a destination and ways to get there, the Travel tag needs each one's time and cost.
  pending: (d) => {
    const missing = d.dest ? transportsOf(d).filter((t) => !parseTimeCost(d[`t_${t}`]).time) : [];
    return missing.length
      ? { page: 1, message: `press **Times and costs** and enter the time (and cost) for ${humanJoin(missing)}. The Travel tag and its commands need them.` }
      : null;
  },
  initial: ({ tag }) => ({ tagName: tag ?? '', dest: '', extra: '', custom: '', transports: [] }),
  // A short description of a saved clue, for the /edit_clue list.
  describe: (d) => d.dest || d.tagName,
  draftKey: (d) => (d.tagName ? `travel:${d.tagName}` : null),
  ready: (d) => Boolean(d.tagName),
  menus: () => [],
  sections: (d) => [
    {
      id: 'route',
      title: 'Tag and destination',
      inputs: [
        ['tagName', 'Tag name', 50, true, undefined, 'e.g. cdm-arrived, dopamine-land'],
        ['dest', 'Destination (blank skips welcome text)', 200, false, undefined, 'e.g. Cajón Del Maipo'],
        ['extra', 'Extra content (optional)', 1000, false, 'paragraph', 'Additional travel information, warnings, etc...'],
        ['custom', 'Custom transport name (if ticked)', 50, false, undefined, 'e.g. tuk tuk, railcar'],
      ],
    },
    ...(transportsOf(d).length
      ? [
          {
            id: 'costs',
            title: 'Times and costs',
            // One box per transport, so all of them fit on one pop-up (four at most).
            inputs: transportsOf(d).map((t) => [`t_${t}`, `${cap(t)}: time, cost`, 150, false, undefined, 'e.g. 40 to 50 minutes, $20']),
          },
        ]
      : []),
  ],
  outputs(d, origin) {
    const kind = d.type === 'touchdown' ? 'touchdown' : 'travel';
    const banner = gallery(bannerImage(origin));
    const transports = transportsOf(d);
    const inits = d.dest ? getInitials(d.dest) : '';
    const airport = d.airport ? (d.airportImage ? `[${d.airport}](${d.airportImage})` : `**${d.airport}**`) : '';
    const routeParts = [banner, airport ? text(`*You have officially touched down at ${airport}!*`) : null, d.extra ? text(`*${d.extra}*`) : null];
    if (d.dest) {
      routeParts.push(
        text(`*${transports.length ? `Make your way by ${humanJoin(transports)} to **${d.dest}** to receive your next clue.` : `Make your way to **${d.dest}** to receive your next clue.`}*`),
        text(
          `*${
            transports.length
              ? `For more information on how to reach this destination, use the command \`!${inits}-Travel\`.\nIf you would like to pause, use the command \`!Pause\`.`
              : `Once you arrive, use the command \`!${inits}-Arrived\`.`
          }*`,
        ),
      );
    }
    const outputs = [
      cardOutput({
        key: `${kind}:${d.tagName}`,
        tag: `${TEST_PREFIX}${d.tagName}`,
        label: 'Route Info tag',
        embed: card(routeParts),
        title: 'Route Info',
        description: d.dest || d.tagName,
      }),
    ];

    const entries = d.dest ? entriesOf(d) : [];
    if (entries.length > 1) {
      outputs.push(
        cardOutput({
          key: `${kind}:${d.tagName}:info`,
          tag: `${TEST_PREFIX}${inits.toLowerCase()}-travel`,
          label: 'Travel tag',
          embed: card([
            banner,
            text('# TRAVEL INFO'),
            ...entries.flatMap(({ option, duration, cost }) => {
              const emoji = TRAVEL_EMOJIS[option.toLowerCase()] || '🗺️';
              const label = TRAVEL_DURATION_LABELS[option.toLowerCase()] || 'Duration';
              return [text(`## ${emoji}  **__${option.toUpperCase()}__**  ${emoji}\n*${label}: ${duration}*\n*Cost: ${cost || '$0'}*`)];
            }),
            separator(),
            text(`*${entries.map(({ option }) => `If you would like to ${travelVerb(option)}, use the command \`!${inits}-${travelCmdSuffix(option)}\`.`).join(' ')}*`),
          ]),
          title: 'Travel Info',
          description: d.dest,
        }),
      );
    }
    for (const { option, duration, cost } of entries) {
      const [label, command] = buildIndividualCommand(option, duration, cost, inits);
      outputs.push(extraOutput({ label, text: command }));
    }
    return outputs;
  },
};

// The touchdown clue that goes with a Leg Start: teams have just landed at the airport and
// make their way to the leg's site. It is the Travel card with a touched-down line first.
// Nothing is made until the site and at least one way to get there are filled in.
export function touchdownOutputs(d, origin) {
  if (!d.site || !transportsOf(d).length) return [];
  const { tagName, ...rest } = {
    ...d,
    type: 'touchdown',
    tagName: `${getInitials(d.site).toLowerCase()}-arrived`,
    dest: d.site,
  };
  return travel.outputs({ ...rest, tagName }, origin);
}
