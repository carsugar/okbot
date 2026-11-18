// A throwaway preview of Route Info built with Components V2, to judge the look.
// Components V2 messages have no `content` or `embeds`, only components.
const IS_COMPONENTS_V2 = 1 << 15;
const EPHEMERAL = 1 << 6;
const ACCENT = 0xf2c230;

const text = (content) => ({ type: 10, content });
const separator = () => ({ type: 14, divider: true, spacing: 2 });

export function routeInfoPreviewMessage(headerImage) {
  const intro = [
    '# ROUTE INFO',
    '-# LEG 3 · SAMPLE DATA',
    '',
    'Make your way from **Machu Picchu, Peru** to your next destination, **Santiago, Chile!**',
  ].join('\n');

  return {
    flags: IS_COMPONENTS_V2 | EPHEMERAL,
    components: [
      {
        type: 17,
        accent_color: ACCENT,
        components: [
          { type: 9, components: [text(intro)], accessory: { type: 11, media: { url: headerImage } } },
          separator(),
          text('All teams will be put onto the same, equalizing **3 hour flight** to Chile. Once there, make your way to **Cajón del Maipo** to receive your next clue.'),
          text('### 💵 Leg money\nYou have received **$15** for this leg. Use the command `!Claim-Leg3-Money` to claim it. Only one designated partner should use this command.'),
          separator(),
          text('### ✈️ Touchdown\nUse the command `!Santiago-Touchdown` to officially land at **SCL Airport**.'),
        ],
      },
    ],
  };
}
