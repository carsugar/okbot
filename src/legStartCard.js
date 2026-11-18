// Pure logic for the Leg Start Route Info card: parse the staff form, build the component
// embed, and the text staff paste into a Carlbot tag.

// Discord shows a masked link with this as its text as nothing at all.
export const INVISIBLE = '⠀';

// The header images are static files served by the Worker itself, so they never expire.
export const bannerImage = (origin, banner = 'route-info') => `${origin}/img/${banner}.webp`;
export const routeInfoBanner = (origin) => bannerImage(origin);

// The embed's left bar takes the colour of its header image.
const BANNER_COLORS = {
  'route-info': 0x1c5097, detour: 0xf99e02, roadblock: 0xe00d12,
  'face-off': 0xdb5500, 'fast-forward': 0x72c742, 'u-turn': 0xecbb01,
};
const DEFAULT_ACCENT = 0xf2c230;
export const accentFor = (parts) => {
  const url = parts.find((p) => p?.type === 12)?.items?.[0]?.media?.url ?? '';
  return BANNER_COLORS[/\/img\/([\w-]+)\.webp/.exec(url)?.[1]] ?? DEFAULT_ACCENT;
};

const text = (content) => ({ type: 10, content });
const separator = () => ({ type: 14, divider: true, spacing: 2 });

export function parseLegStart({ leg, departure, destination, money, flightTime }) {
  const [depName, depImage = ''] = departure.split('|').map((s) => s.trim());
  const [dest, site = '', airport = ''] = destination.split('|').map((s) => s.trim());
  // The city is everything before the comma, hyphenated and capitalized: "New Delhi, India" is New-Delhi.
  const slug = dest.split(',')[0].split(/\s+/).map((w) => w.replace(/[^a-z0-9]/gi, '').toLowerCase()).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('-') || 'Dest';
  const rawMoney = money.replace(/^\$/, '').trim();
  const flight = flightTime.replace(/\bhours\b/gi, 'hour');
  return {
    leg,
    departure: depName,
    departureImage: depImage,
    destination: dest,
    site,
    airport,
    country: dest.includes(',') ? dest.split(',').pop().trim() : dest,
    money: rawMoney,
    moneyDisplay: rawMoney ? `$${rawMoney}` : '',
    flightTime: /\bflight\b/i.test(flight) ? flight.replace(/\bhour flights?\b/i, 'hour flight') : `${flight} flight`,
    moneyCommand: `!Claim-Leg${leg}-Money`,
    touchdownCommand: `!${slug}-Touchdown`,
  };
}

// Money and touchdown have no title: just an emoji at the left of the line.

export function legStartEmbed(d, headerImage) {
  const parts = [
    { type: 12, items: [{ media: { url: headerImage } }] },
    text(`Make your way from **${d.departure}** to your next destination, **${d.destination}!**`),
    ...(d.departureImage ? [{ type: 12, items: [{ media: { url: d.departureImage } }] }] : []),
    separator(),
    text(
      `All teams will be put onto the same, equalizing **${d.flightTime}** to ${d.country}.` +
        (d.site ? ` Once there, make your way to **${d.site}** to receive your next clue.` : ''),
    ),
    separator(),
  ];
  if (d.moneyDisplay) {
    parts.push(
      text(
        `💵 You have received **${d.moneyDisplay}** for this leg. Use the command \`${d.moneyCommand}\` to claim it. ` +
          'Only one designated partner should use this command.',
      ),
      { type: 14, divider: false, spacing: 1 },
    );
  }
  parts.push(
    text(`🛬 Use the command \`${d.touchdownCommand}\` to officially land` + (d.airport ? ` at **${d.airport}**.` : '.')),
  );
  return { component: { type: 17, accent_color: accentFor(parts), components: parts } };
}

// The form values that would produce this saved leg, to pre-fill the form when editing.
export function legFormValues(d) {
  const destParts = [d.destination, d.site, d.airport];
  while (destParts.length > 1 && !destParts.at(-1)) destParts.pop();
  return {
    departure: d.departureImage ? `${d.departure} | ${d.departureImage}` : d.departure,
    destination: destParts.join(' | '),
    money: d.moneyDisplay,
    flight_time: d.flightTime.replace(/ flight$/, ''),
  };
}

// Carlbot fills {unix} with the current time each time the tag runs, so every use posts a
// slightly different link and Discord fetches the card fresh instead of reusing a cached one.
export const legTagText = ({ carlbotMention, tagName, url }) =>
  `${carlbotMention} tag + ${tagName} [${INVISIBLE}](${url}?v={unix})`;

export const mimuAutoresponder = (d) =>
  d.moneyDisplay
    ? `/autoresponder add trigger:${d.moneyCommand} reply:${d.moneyDisplay} has been added to your account! {modifybal: ${d.money}}`
    : null;

// Nine random bytes become a 12-character url-safe slug.
export function newSlug(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_');
}
