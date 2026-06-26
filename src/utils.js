import { verifyKey } from 'discord-interactions';

export class JsonResponse extends Response {
  constructor(body, init = {}) {
    super(JSON.stringify(body), {
      headers: { 'Content-Type': 'application/json;charset=UTF-8' },
      ...init,
    });
  }
}

export async function verifyDiscordRequest(request, env) {
  const sig = request.headers.get('x-signature-ed25519');
  const ts = request.headers.get('x-signature-timestamp');
  const body = await request.text();
  const isValid = sig && ts && (await verifyKey(body, sig, ts, env.DISCORD_PUBLIC_KEY));
  if (!isValid) return { isValid: false };
  return { interaction: JSON.parse(body), isValid: true };
}

export async function sendFollowup(env, token, data) {
  const body = typeof data === 'string' ? { content: data, flags: 64 } : data;
  await fetch(`https://discord.com/api/v10/webhooks/${env.DISCORD_APPLICATION_ID}/${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
