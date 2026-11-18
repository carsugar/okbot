// Pure logic for the Leg Start Route Info card: parse the staff form, build the component
// embed, and the text staff paste into a Carlbot tag.

// Discord shows a masked link with this as its text as nothing at all.
export const INVISIBLE = '⠀';

const text = (content) => ({ type: 10, content });
const separator = () => ({ type: 14, divider: true, spacing: 2 });

export function parseLegStart({ leg, departure, destination, money, flightTime }) {
  const [depName] = departure.split('|').map((s) => s.trim());
  const [dest, site = '', airport = ''] = destination.split('|').map((s) => s.trim());
  const slug = (dest.split(/\s+/)[0] || 'dest').replace(/[^a-z0-9]/gi, '').toLowerCase();
  const rawMoney = money.replace(/^\$/, '').trim();
  const flight = flightTime.replace(/\bhours\b/gi, 'hour');
  return {
    leg,
    departure: depName,
    destination: dest,
    site,
    airport,
    country: dest.includes(',') ? dest.split(',').pop().trim() : dest,
    money: rawMoney,
    moneyDisplay: rawMoney ? `$${rawMoney}` : '',
    flightTime: /\bflight\b/i.test(flight) ? flight.replace(/\bhour flights?\b/i, 'hour flight') : `${flight} flight`,
    moneyCommand: `!Claim-Leg${leg}-Money`,
    touchdownCommand: `!${slug.charAt(0).toUpperCase()}${slug.slice(1)}-Touchdown`,
  };
}

export function legStartEmbed(d, headerImage) {
  const parts = [
    text(`# ROUTE INFO\n-# LEG ${d.leg} START`),
    { type: 12, items: [{ media: { url: headerImage } }] },
    text(`Make your way from **${d.departure}** to your next destination, **${d.destination}!**`),
    separator(),
    text(
      `All teams will be put onto the same, equalizing **${d.flightTime}** to ${d.country}.` +
        (d.site ? ` Once there, make your way to **${d.site}** to receive your next clue.` : ''),
    ),
  ];
  if (d.moneyDisplay) {
    parts.push(
      text(
        `### 💵 Leg money\nYou have received **${d.moneyDisplay}** for this leg. Use the command \`${d.moneyCommand}\` to claim it. ` +
          'Only one designated partner should use this command.',
      ),
    );
  }
  parts.push(
    separator(),
    text(
      `### ✈️ Touchdown\nUse the command \`${d.touchdownCommand}\` to officially land` +
        (d.airport ? ` at **${d.airport}**.` : '.'),
    ),
  );
  return { component: { type: 17, accent_color: 0xf2c230, components: parts } };
}

export const legTagText = ({ carlbotMention, tagName, url }) => `${carlbotMention} tag + ${tagName} [${INVISIBLE}](${url})`;

export const mimuAutoresponder = (d) =>
  d.moneyDisplay
    ? `/autoresponder add trigger:${d.moneyCommand} reply:${d.moneyDisplay} has been added to your account! {modifybal: ${d.money}}`
    : null;

// Nine random bytes become a 12-character url-safe slug.
export function newSlug(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_');
}
