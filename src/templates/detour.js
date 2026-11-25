import { bannerImage } from '../legStartCard.js';
import { getInitials } from '../tagTemplates.js';
import { hasLeg, legField, legStartValue, TEST_PREFIX, italic, card, gallery, text, separator, cardOutput, tagOutput } from './common.js';

const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]/g, '');
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// One side of the detour: its name, how long to get there, where it is (and a picture of it),
// and what happens there. The card text is built from them, so every side reads the same way.
const SIDE_KEYS = (n) => [`name${n}`, `time${n}`, `loc${n}`, `img${n}`, `desc${n}`];
const blankSide = (n) => Object.fromEntries(SIDE_KEYS(n).map((k) => [k, '']));
const sideDone = (d, n) => Boolean(d[`name${n}`] && d[`time${n}`] && d[`loc${n}`] && d[`desc${n}`]);

// The arrival tag: the name typed, or for detours saved before it was asked, the old area initials.
const arrivalTag = (d) => d.tagName || (d.location ? `${getInitials(d.location).toLowerCase()}-arrived` : '');

// The tag that shows an option's details: typed, or for detours saved before it was asked, the option name.
const optionTag = (d, n) => d[`tag${n}`] || (d.location ? slug(d[`name${n}`]) : '');

const sideSection = (n) => ({
  id: `side${n}`,
  title: `Option ${n}`,
  perPage: 5, // each side of the detour gets a pop-up of its own
  pageLabel: (d) => (sideDone(d, n) ? `Edit option ${n}` : `Option ${n}`),
  inputs: [
    [`name${n}`, `Option ${n} name`, 50, true, undefined, 'e.g. Suite'],
    [`time${n}`, `Option ${n} travel time`, 50, true, undefined, 'e.g. 25 minutes'],
    [`loc${n}`, `Option ${n} location name`, 100, true, undefined, 'e.g. Mozartplatz'],
    [`img${n}`, `Option ${n} location image URL (optional)`, 500, false, undefined, 'https://www.imageURL.com', 'The location name links to this picture. Leave blank for no link.'],
    [`desc${n}`, `Option ${n}: what happens there`, 1200, true, 'paragraph', "e.g. where they'll honor Mozart. Teams must rehearse and perform one of his pieces.", 'Start with "where". It follows "In [name], teams will travel [time] to [location],"'],
  ],
});

// "In **Suite**, teams will travel 25 minutes to [**Mozartplatz**](image), where they'll..."
const sideText = (d, n) => {
  const place = d[`img${n}`] ? `[**${d[`loc${n}`]}**](${d[`img${n}`]})` : `**${d[`loc${n}`]}**`;
  return `In **${d[`name${n}`]}**, teams will travel ${d[`time${n}`]} to ${place}, ${d[`desc${n}`]}`;
};

export const detour = {
  id: 'detour',
  label: 'Detour',
  needs: [],
  hint: 'Work through the steps below to see the cards.',
  // The checklist and what to do next: general details, then each side of the detour.
  steps: (d) => [
    { label: 'Details', detail: 'Leg number and the three tag names', done: Boolean(hasLeg(d) && arrivalTag(d) && optionTag(d, 1) && optionTag(d, 2)) },
    { label: 'Option 1', detail: 'Name, travel time, location, image, what happens', done: sideDone(d, 1) },
    { label: 'Option 2', detail: 'Name, travel time, location, image, what happens', done: sideDone(d, 2) },
    { label: 'Arrival image and switch time', detail: 'Image, switch travel time', done: Boolean(d.image || d.switchTime), optional: true },
  ],
  initial: ({ leg, tag }) => ({ leg: legStartValue(leg), tagName: tag ?? '', tag1: '', tag2: '', location: '', image: '', switchTime: '', ...blankSide(1), ...blankSide(2) }),
  // A short description of a saved clue, for the /edit_clue list.
  describe: (d) => d.location || `${d.name1} or ${d.name2}`,
  draftKey: (d) => (hasLeg(d) ? `detour:l${d.leg}` : null),
  ready: (d) => hasLeg(d) && Boolean(arrivalTag(d)) && sideDone(d, 1) && sideDone(d, 2) && Boolean(optionTag(d, 1) && optionTag(d, 2)),
  menus: () => [],
  sections: () => [
    { id: 'leg', title: 'Leg', inputs: [legField] },
    {
      id: 'tags',
      title: 'Tag names',
      inputs: [
        ['tagName', 'Tag name for the detour start', 50, true, undefined, 'e.g. cdm-detour, san-jose-detour', 'The tag staff send to start the detour.'],
        ['tag1', 'Tag name for option 1 details', 50, true, undefined, 'e.g. cdm-detour-suite', 'Not the option name. Teams use that to start the option.'],
        ['tag2', 'Tag name for option 2 details', 50, true, undefined, 'e.g. cdm-detour-garden', 'Not the option name. Teams use that to start the option.'],
      ],
    },
    sideSection(1),
    sideSection(2),
    {
      id: 'extras',
      title: 'Arrival image and switch time',
      inputs: [
        ['image', 'Arrival image URL (optional)', 500, false, undefined, 'https://www.imageURL.com'],
        ['switchTime', 'Switch travel time (optional)', 50, false, undefined, 'e.g. 10 minutes'],
      ],
    },
  ],
  outputs(d, origin) {
    const banner = gallery(bannerImage(origin, 'detour'));
    // What teams type to start an option is its name; the card that shows its details has its own tag.
    const [show1, show2] = [cap(optionTag(d, 1)), cap(optionTag(d, 2))];
    const switchShown = `Switch-L${d.leg}-Detour`;
    const side = (name, n) =>
      cardOutput({
        key: `detour:l${d.leg}:${n}`,
        tag: `${TEST_PREFIX}${optionTag(d, n)}`,
        label: `Option ${n}: ${name}`,
        embed: card([
          banner,
          text(`*${sideText(d, n)}*`),
          text(`*If you'd like to perform this side of the detour, use the command \`!${cap(slug(name))}\`.*`),
          text(`*If you would like to switch, use the command \`!${switchShown}\`.*`),
        ]),
        title: `Detour: ${name}`,
        description: d.location || d.name1,
      });
    return [
      cardOutput({
        key: `detour:l${d.leg}:arrival`,
        tag: `${TEST_PREFIX}${arrivalTag(d)}`,
        label: 'Detour start',
        embed: card([
          banner,
          text(`### ${d.name1.toUpperCase()} OR ${d.name2.toUpperCase()}?`),
          text(
            italic(
              `Use the commands \`!${show1}\` and \`!${show2}\` to view the details of both sides of the detour, and exit ${d.location ? `**${d.location}**` : 'the detour'} when you are ready.` +
                `\nIf your team chooses to switch sides of the detour at any point, use the command \`!${switchShown}\` to travel and begin the other side. ` +
                'Please note that switching will erase all progress, and returning later will require you to start from the beginning.',
            ),
          ),
          d.image ? gallery(d.image) : null,
        ]),
        title: 'Detour',
        description: `${d.name1} or ${d.name2}`,
      }),
      side(d.name1, 1),
      side(d.name2, 2),
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
