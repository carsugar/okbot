import { bannerImage } from '../legStartCard.js';
import { humanJoin, getInitials, travelCmdSuffix, travelVerb, buildIndividualCommand, TRAVEL_EMOJIS, TRAVEL_DURATION_LABELS } from '../tagTemplates.js';
import { TEST_PREFIX, card, gallery, text, separator, cardOutput, extraOutput } from './common.js';

const TRANSPORTS = [
  { value: 'taxi', label: '🚕 Taxi' },
  { value: 'bus', label: '🚌 Bus' },
  { value: 'walking', label: '🚶 Walking' },
];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// The chosen transports, then the custom one if there is one. Costs are asked for at most five.
export const transportsOf = (d) => [...(d.transports ?? []), ...(d.custom ? [d.custom] : [])].slice(0, 5);

// Each transport's "duration | cost" answer, most expensive first.
function entriesOf(d) {
  return transportsOf(d)
    .map((option) => {
      const raw = d[`t_${option}`];
      if (!raw) return null;
      const [duration, cost = ''] = raw.split('|').map((s) => s.trim());
      return { option, duration, cost, costVal: parseFloat(cost.replace(/[^0-9.]/g, '') || '0') };
    })
    .filter(Boolean)
    .sort((a, b) => b.costVal - a.costVal);
}

export const travel = {
  id: 'travel',
  label: 'Route Info: Travel',
  needs: [],
  hint: 'Fill in the tag name to see the card.',
  initial: ({ tag }) => ({ tagName: tag ?? '', dest: '', extra: '', custom: '', transports: [] }),
  draftKey: (d) => `travel:${d.tagName}`,
  ready: (d) => Boolean(d.tagName),
  menus: (d) => [
    { id: 'transports', key: 'transports', placeholder: 'Ways to get there', multi: true, options: TRANSPORTS, selected: d.transports ?? [] },
  ],
  sections: (d) => [
    {
      id: 'route',
      title: 'Tag and destination',
      inputs: [
        ['tagName', 'Tag name', 50, true],
        ['dest', 'Destination (blank skips welcome text)', 200, false],
        ['extra', 'Extra content (optional)', 1000, false, 'paragraph'],
        ['custom', 'Custom transport name (optional)', 50, false],
      ],
    },
    ...(transportsOf(d).length
      ? [
          {
            id: 'costs',
            title: 'Times and costs',
            inputs: transportsOf(d).map((t) => [`t_${t}`, `${cap(t)}: time | cost`, 150, false]),
          },
        ]
      : []),
  ],
  outputs(d, origin) {
    const banner = gallery(bannerImage(origin));
    const transports = transportsOf(d);
    const inits = d.dest ? getInitials(d.dest) : '';
    const routeParts = [banner, d.extra ? text(d.extra) : null];
    if (d.dest) {
      routeParts.push(
        text(transports.length ? `Make your way by ${humanJoin(transports)} to **${d.dest}** to receive your next clue.` : `Make your way to **${d.dest}** to receive your next clue.`),
        text(
          transports.length
            ? `For more information on how to reach this destination, use the command \`!${inits}-Travel\`. If you would like to pause, use the command \`!Pause\`.`
            : `Once you arrive, use the command \`!${inits}-Arrived\`.`,
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
            text('### Travel info'),
            ...entries.flatMap(({ option, duration, cost }) => {
              const emoji = TRAVEL_EMOJIS[option.toLowerCase()] || '🗺️';
              const label = TRAVEL_DURATION_LABELS[option.toLowerCase()] || 'Duration';
              return [text(`## ${emoji} ${option.toUpperCase()}\n${label}: ${duration}\nCost: ${cost || '$0'}`)];
            }),
            separator(),
            text(entries.map(({ option }) => `If you would like to ${travelVerb(option)}, use the command \`!${inits}-${travelCmdSuffix(option)}\`.`).join(' ')),
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
