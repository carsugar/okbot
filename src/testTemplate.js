import { JsonResponse, sendFollowup } from './utils.js';
import { parseLegStart, legStartEmbed, legTagText, mimuAutoresponder, routeInfoBanner, legFormValues } from './legStartCard.js';
import { embedBytes, MAX_EMBED_BYTES } from './routeEmbedPage.js';
import { routeStore } from './routeStore.js';

// Staging versions of the template commands. They share nothing with /tag_template, and
// their tags are named test-leg-N so they never collide with real ones.
const CARLBOT_MENTION = '<@235148962103951360>';
const EPHEMERAL = 64;

const row = (component) => ({ type: 1, components: [component] });
const input = (custom_id, label, placeholder, max_length, required = true, value = '') =>
  row({ type: 4, custom_id, label, placeholder, style: 1, max_length, required, ...(value && { value: value.slice(0, max_length) }) });

const getField = (interaction, id) =>
  (interaction.data.components ?? []).flatMap((r) => r.components ?? []).find((c) => c.custom_id === id)?.value?.trim() ?? '';

const privately = (content) => new JsonResponse({ type: 4, data: { content, flags: EPHEMERAL } });

export async function handleTestTemplateCommand(interaction, env) {
  const sub = interaction.data.options?.[0];
  if (sub?.name !== 'routeinfo_legstart') return new JsonResponse({ error: 'Unknown subcommand' }, { status: 400 });
  const leg = sub.options.find((o) => o.name === 'leg').value;
  // Editing a leg that already exists opens the form with its saved values.
  const saved = await routeStore(env).getByKey(`${interaction.guild_id}:leg-${leg}`);
  const v = saved ? legFormValues(saved) : {};
  return new JsonResponse({
    type: 9,
    data: {
      custom_id: `tmodal_legstart:${leg}`,
      title: `Route Info: Leg ${leg} Start${saved ? ' (editing)' : ' (test)'}`,
      components: [
        input('departure', 'Departure City, Country | Image URL', 'e.g. Santiago, Chile | https://www.imageURL.com', 600, true, v.departure),
        input('destination', 'Destination city, country | site | airport', 'e.g. Beijing, China | Temple of Heaven | PEK Airport', 400, true, v.destination),
        input('money', 'Leg Money', 'e.g. $15', 20, false, v.money),
        input('flight_time', 'Flight Duration', 'e.g. 3 hours', 100, true, v.flight_time),
      ],
    },
  });
}

export async function handleTestTemplateModal(interaction, env, ctx, origin) {
  const leg = interaction.data.custom_id.split(':')[1];
  const data = parseLegStart({
    leg,
    departure: getField(interaction, 'departure'),
    destination: getField(interaction, 'destination'),
    money: getField(interaction, 'money'),
    flightTime: getField(interaction, 'flight_time'),
  });

  const bytes = embedBytes(legStartEmbed(data, routeInfoBanner(origin)));
  if (bytes > MAX_EMBED_BYTES) {
    return privately(`That card is too long for a link preview (${bytes} of ${MAX_EMBED_BYTES} bytes). Shorten the fields and try again.`);
  }

  const slug = await routeStore(env).save(`${interaction.guild_id}:leg-${leg}`, data);
  const url = `${origin}/route/${slug}`;
  const tagName = `test-leg-${leg}`;

  const autoresponder = mimuAutoresponder(data);
  if (autoresponder) {
    ctx.waitUntil(sendFollowup(env, interaction.token, `**Mimu autoresponder: \`${data.moneyCommand}\`**\n\`\`\`\n${autoresponder}\n\`\`\``));
  }

  return privately(
    `**Leg Start tag (\`!${tagName}\`)**\n\`\`\`\n${legTagText({ carlbotMention: CARLBOT_MENTION, tagName, url })}\n\`\`\`\nPreview: ${url}`,
  );
}
