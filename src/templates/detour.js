import { bannerImage } from '../legStartCard.js';
import { getInitials } from '../tagTemplates.js';
import { TEST_PREFIX, card, gallery, text, separator, cardOutput, tagOutput } from './common.js';

const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]/g, '');
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export const detour = {
  id: 'detour',
  label: 'Detour',
  needs: ['leg'],
  hint: 'Fill in the location and both sides to see the cards.',
  initial: ({ leg }) => ({ leg: String(leg), location: '', image: '', switchTime: '', name1: '', desc1: '', name2: '', desc2: '' }),
  draftKey: (d) => `detour:l${d.leg}`,
  ready: (d) => Boolean(d.location && d.name1 && d.desc1 && d.name2 && d.desc2),
  menus: () => [],
  sections: () => [
    {
      id: 'location',
      title: 'Location and switch',
      inputs: [
        ['location', 'Location name', 100, true],
        ['image', 'Location image URL (optional)', 500, false],
        ['switchTime', 'Switch travel time (optional)', 50, false],
      ],
    },
    {
      id: 'side1',
      title: 'Option 1',
      inputs: [
        ['name1', 'Option 1 name', 50, true],
        ['desc1', 'Option 1 description', 1500, true, 'paragraph'],
      ],
    },
    {
      id: 'side2',
      title: 'Option 2',
      inputs: [
        ['name2', 'Option 2 name', 50, true],
        ['desc2', 'Option 2 description', 1500, true, 'paragraph'],
      ],
    },
  ],
  outputs(d, origin) {
    const banner = gallery(bannerImage(origin, 'detour'));
    const [cmd1, cmd2] = [slug(d.name1), slug(d.name2)];
    const [show1, show2] = [cap(cmd1), cap(cmd2)];
    const switchShown = `Switch-L${d.leg}-Detour`;
    const side = (name, desc, key, cmd) =>
      cardOutput({
        key: `detour:l${d.leg}:${key}`,
        tag: `${TEST_PREFIX}${cmd}`,
        label: `Option ${key}: ${name}`,
        embed: card([banner, text(`### DETOUR: ${name.toUpperCase()}`), text(desc), separator(), text(`If you would like to switch, use the command \`!${switchShown}\`.`)]),
        title: `Detour: ${name}`,
        description: d.location,
      });
    return [
      cardOutput({
        key: `detour:l${d.leg}:arrival`,
        tag: `${TEST_PREFIX}${getInitials(d.location).toLowerCase()}-arrived`,
        label: 'Detour arrival',
        embed: card([
          banner,
          text(`### DETOUR: ${d.name1.toUpperCase()} OR ${d.name2.toUpperCase()}?`),
          text(
            `Use the commands \`!${show1}\` and \`!${show2}\` to view the details of both sides of the detour, and exit **${d.location}** when you are ready. ` +
              `If your team chooses to switch sides of the detour at any point, use the command \`!${switchShown}\` to travel and begin the other side. ` +
              'Please note that switching will erase all progress, and returning later will require you to start from the beginning.',
          ),
          d.image ? gallery(d.image) : null,
        ]),
        title: 'Detour',
        description: `${d.name1} or ${d.name2}`,
      }),
      side(d.name1, d.desc1, '1', cmd1),
      side(d.name2, d.desc2, '2', cmd2),
      tagOutput({
        tag: `${TEST_PREFIX}switch-l${d.leg}-detour`,
        label: `Switch (\`!${switchShown}\`)`,
        text: d.switchTime
          ? `*You will travel **${d.switchTime}** to the other detour. If you would like to switch, use the arrival command of the other detour.*`
          : '*If you would like to switch, use the arrival command of the other detour.*',
      }),
    ];
  },
};
