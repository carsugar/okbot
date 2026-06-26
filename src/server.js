import { AutoRouter } from 'itty-router';
import { InteractionType, InteractionResponseType } from 'discord-interactions';
import { JsonResponse, verifyDiscordRequest } from './utils.js';
import { handleCommand, handleComponent, handleModalSubmit } from './tagTemplates.js';

const router = AutoRouter();

router.get('/', (request, env) => {
  return new Response(`okbot | ${env.DISCORD_APPLICATION_ID}`);
});

router.post('/', async (request, env, ctx) => {
  const { isValid, interaction } = await verifyDiscordRequest(request, env);
  if (!isValid || !interaction) {
    return new Response('Bad request signature.', { status: 401 });
  }

  if (interaction.type === InteractionType.PING) {
    return new JsonResponse({ type: InteractionResponseType.PONG });
  }

  if (interaction.type === InteractionType.APPLICATION_COMMAND) {
    return handleCommand(interaction);
  }

  if (interaction.type === InteractionType.MESSAGE_COMPONENT) {
    return handleComponent(interaction);
  }

  if (interaction.type === 5) {
    return handleModalSubmit(interaction, env, ctx);
  }

  return new JsonResponse({ error: 'Unknown interaction type' }, { status: 400 });
});

router.all('*', () => new Response('Not Found.', { status: 404 }));

export default { fetch: router.fetch };
