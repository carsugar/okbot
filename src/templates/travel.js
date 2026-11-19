import { bannerImage } from '../legStartCard.js';
import { humanJoin, getInitials, travelCmdSuffix, travelVerb, buildIndividualCommand, TRAVEL_EMOJIS, TRAVEL_DURATION_LABELS } from '../tagTemplates.js';
import { TEST_PREFIX, card, gallery, text, separator, cardOutput, extraOutput } from './common.js';

const TRANSPORTS = [
  { value: 'taxi', label: '🚕 Taxi' },
  { value: 'bus', label: '🚌 Bus' },
  { value: 'walking', label: '🚶 Walking' },
  { value: 'custom', label: '✏️ Custom' },
];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// The chosen transports, then the custom one if there is one. Costs are asked for at most five.
export const transportsOf = (d) => {
  const picked = d.transports ?? [];
  return [...picked.filter((t) => t !== 'custom'), ...(picked.includes('custom') && d.custom ? [d.custom] : [])].slice(0, 5);
};

// Each transport's "duration | cost" answer, most expensive first.
function entriesOf(d) {
  return transportsOf(d)
    .map((option) => {
      // Times and costs are separate boxes; drafts saved earlier have "time | cost" in one.
      const [duration, oldCost = ''] = (d[`t_${option}`] ?? '').split('|').map((s) => s.trim());
      const cost = (d[`c_${option}`] ?? '').trim() || oldCost;
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
  // With a destination and ways to get there, the Travel tag needs each one's time and cost.
  pending: (d) => {
    const missing = d.dest ? transportsOf(d).filter((t) => !(d[`t_${t}`] ?? '').split('|')[0].trim()) : [];
    return missing.length
      ? { page: 1, message: `press **Times and costs** and enter the time (and cost) for ${humanJoin(missing)}. The Travel tag and its commands need them.` }
      : null;
  },
  initial: ({ tag }) => ({ tagName: tag ?? '', dest: '', extra: '', custom: '', transports: [] }),
  draftKey: (d) => (d.tagName ? `travel:${d.tagName}` : null),
  ready: (d) => Boolean(d.tagName),
  menus: () => [],
  sections: (d) => [
    {
      id: 'route',
      title: 'Tag and destination',
      inputs: [
        ['tagName', 'Tag name', 50, true],
        ['dest', 'Destination (blank skips welcome text)', 200, false],
        ['extra', 'Extra content (optional)', 1000, false, 'paragraph'],
        ['custom', 'Custom transport name (if ticked)', 50, false],
      ],
    },
    ...(transportsOf(d).length
      ? [
          {
            id: 'costs',
            title: 'Times and costs',
            perPage: 4, // two transports at a time, each with its time and cost
            inputs: transportsOf(d).flatMap((t) => [
              [`t_${t}`, `${cap(t)}: time, e.g. 40 to 50 minutes`, 100, false],
              [`c_${t}`, `${cap(t)}: cost, e.g. $20`, 50, false],
            ]),
          },
        ]
      : []),
  ],
  outputs(d, origin) {
    const banner = gallery(bannerImage(origin));
    const transports = transportsOf(d);
    const inits = d.dest ? getInitials(d.dest) : '';
    const routeParts = [banner, d.extra ? text(`*${d.extra}*`) : null];
    if (d.dest) {
      routeParts.push(
        text(`*${transports.length ? `Make your way by ${humanJoin(transports)} to **${d.dest}** to receive your next clue.` : `Make your way to **${d.dest}** to receive your next clue.`}*`),
        text(
          `*${
            transports.length
              ? `For more information on how to reach this destination, use the command \`!${inits}-Travel\`. If you would like to pause, use the command \`!Pause\`.`
              : `Once you arrive, use the command \`!${inits}-Arrived\`.`
          }*`,
        ),
      );
    }
    const outputs = [
      cardOutput({
        key: `travel:${d.tagName}`,
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
          key: `travel:${d.tagName}:info`,
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
