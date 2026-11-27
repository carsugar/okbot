import { JsonResponse } from './utils.js';

// Lists the choices it was given, then picks the same answer every time.
export const chooseReply = (raw = '') => {
  const choices = raw.split(',').map((c) => c.trim()).filter(Boolean);
  const list = choices.map((c) => `• ${c}`).join('\n');
  return `${list ? `Choosing between:\n${list}\n\n` : ''}**Anyone but Carling**`.slice(0, 2000);
};

export const handleChoose = (interaction) =>
  new JsonResponse({
    type: 4,
    data: { content: chooseReply(interaction.data.options?.find((o) => o.name === 'options')?.value), allowed_mentions: { parse: [] } },
  });
