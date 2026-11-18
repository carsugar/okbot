import { AutoRouter } from 'itty-router';
import { sampleRouteInfoEmbed, embedPageHtml } from './routeEmbedPage.js';
import { handleTestTemplateCommand } from './testTemplate.js';
import { handleLegEditorComponent, handleLegEditorModal } from './legEditor.js';
import { routeStore } from './routeStore.js';
import { legStartEmbed, bannerImage } from './legStartCard.js';
import { InteractionType, InteractionResponseType } from 'discord-interactions';
import { JsonResponse, verifyDiscordRequest } from './utils.js';
import { handleCommand, handleComponent, handleModalSubmit } from './tagTemplates.js';
import { handleMindMeldCommand, handleMindMeldComponent, handleMindMeldModal } from './mindmeld.js';
import { cardImageResponse } from './cardRoute.js';
import { handleMemoryPokerCommand, handleMemoryPokerComponent, handleMemoryPokerModal } from './memorypoker.js';

export { MindMeldGame } from './mindmeld.js';
export { RouteStore } from './routeStore.js';
export { MemoryPokerGame } from './memorypoker.js';

const router = AutoRouter();

router.get('/', (request, env) => {
  return new Response(`okbot | ${env.DISCORD_APPLICATION_ID}`);
});

router.get('/route/preview', (request) =>
  new Response(embedPageHtml(sampleRouteInfoEmbed(routeInfoBanner(new URL(request.url).origin)), { title: 'Route Info: Leg 3', description: 'Sample Route Info card' }), {
    headers: { 'Content-Type': 'text/html;charset=UTF-8' },
  }));

router.get('/route/:slug', async (request, env) => {
  const data = await routeStore(env).get(request.params.slug);
  if (!data) return new Response('Not Found.', { status: 404 });
  const title = `Route Info: Leg ${data.leg} Start`;
  return new Response(embedPageHtml(legStartEmbed(data, bannerImage(new URL(request.url).origin, data.banner)), { title, description: `${data.departure} to ${data.destination}` }), {
    headers: { 'Content-Type': 'text/html;charset=UTF-8' },
  });
});

router.get('/mp/:kind/:file', (request, env, ctx) => cardImageResponse(request, ctx));

router.post('/', async (request, env, ctx) => {
  const { isValid, interaction } = await verifyDiscordRequest(request, env);
  if (!isValid || !interaction) {
    return new Response('Bad request signature.', { status: 401 });
  }

  if (interaction.type === InteractionType.PING) {
    return new JsonResponse({ type: InteractionResponseType.PONG });
  }

  if (interaction.type === InteractionType.APPLICATION_COMMAND) {
    if (interaction.data.name === 'mindmeld') return handleMindMeldCommand(interaction, env);
    if (interaction.data.name === 'test_template') return handleTestTemplateCommand(interaction, env, new URL(request.url).origin);
    if (interaction.data.name === 'memorypoker') return handleMemoryPokerCommand(interaction, env, new URL(request.url).origin);
    return handleCommand(interaction);
  }

  if (interaction.type === InteractionType.MESSAGE_COMPONENT) {
    if (interaction.data.custom_id.startsWith('mm:')) return handleMindMeldComponent(interaction, env);
    if (interaction.data.custom_id.startsWith('le:')) return handleLegEditorComponent(interaction, env, ctx, new URL(request.url).origin);
    if (interaction.data.custom_id.startsWith('mp:')) return handleMemoryPokerComponent(interaction, env, new URL(request.url).origin);
    return handleComponent(interaction);
  }

  if (interaction.type === 5) {
    if (interaction.data.custom_id.startsWith('mm_modal:')) return handleMindMeldModal(interaction, env);
    if (interaction.data.custom_id.startsWith('le_modal:')) return handleLegEditorModal(interaction, env, new URL(request.url).origin);
    if (interaction.data.custom_id.startsWith('mp_modal:')) return handleMemoryPokerModal(interaction, env, new URL(request.url).origin);
    return handleModalSubmit(interaction, env, ctx);
  }

  return new JsonResponse({ error: 'Unknown interaction type' }, { status: 400 });
});

router.all('*', () => new Response('Not Found.', { status: 404 }));

export default { fetch: router.fetch };
