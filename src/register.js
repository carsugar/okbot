import { TAG_TEMPLATE_COMMAND } from './commands.js';

const token = process.env.DISCORD_TOKEN;
const applicationId = process.env.DISCORD_APPLICATION_ID;

if (!token || !applicationId) {
  throw new Error('Set DISCORD_TOKEN and DISCORD_APPLICATION_ID env vars before running.');
}

const response = await fetch(`https://discord.com/api/v10/applications/${applicationId}/commands`, {
  method: 'PUT',
  headers: {
    Authorization: `Bot ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify([TAG_TEMPLATE_COMMAND]),
});

if (response.ok) {
  const data = await response.json();
  console.log(`Registered ${data.length} command(s).`);
} else {
  const err = await response.text();
  console.error('Failed to register commands:', err);
  process.exit(1);
}
