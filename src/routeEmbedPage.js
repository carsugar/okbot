// A web page whose only job is to carry a Discord component embed: pasting its link in
// Discord shows the card instead of the normal link preview. Discord does not run
// JavaScript, so the payload must be in the served HTML. Limit: 3,000 bytes.
export const MAX_EMBED_BYTES = 3000;

const text = (content) => ({ type: 10, content });
const separator = () => ({ type: 14, divider: true, spacing: 2 });

export function sampleRouteInfoEmbed() {
  return {
    component: {
      type: 17,
      accent_color: 0xf2c230,
      components: [
        text('# ROUTE INFO\n-# LEG 3 · SAMPLE DATA\n\nMake your way from **Machu Picchu, Peru** to your next destination, **Santiago, Chile!**'),
        separator(),
        text('All teams will be put onto the same, equalizing **3 hour flight** to Chile. Once there, make your way to **Cajón del Maipo** to receive your next clue.'),
        text('### 💵 Leg money\nYou have received **$15** for this leg. Use the command `!Claim-Leg3-Money` to claim it. Only one designated partner should use this command.'),
        separator(),
        text('### ✈️ Touchdown\nUse the command `!Santiago-Touchdown` to officially land at **SCL Airport**.'),
      ],
    },
  };
}

const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function embedPageHtml(embed, { title, description }) {
  const json = JSON.stringify(embed).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<script id="discord:component-embed" type="application/json">${json}</script>
</head><body><h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p></body></html>`;
}

export const embedBytes = (embed) => new TextEncoder().encode(JSON.stringify(embed)).length;
