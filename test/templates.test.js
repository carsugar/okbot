import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TEMPLATES, TEMPLATE_CHOICES } from '../src/templates/index.js';
import { outputBlock } from '../src/templates/common.js';
import { embedBytes, MAX_EMBED_BYTES } from '../src/routeEmbedPage.js';
import { CREATE_CLUE_COMMAND, EDIT_CLUE_COMMAND } from '../src/commands.js';

const ORIGIN = 'https://okbot.example.dev';
const cardText = (o) => o.embed.component.components.filter((c) => c.type === 10).map((c) => c.content).join('\n');
const images = (o) => o.embed.component.components.filter((c) => c.type === 12).map((c) => c.items[0].media.url);
const run = (id, fields, opts = { leg: 3, tag: 'x' }) => TEMPLATES[id].outputs({ ...TEMPLATES[id].initial(opts), ...fields }, ORIGIN);

test('create_clue offers every template as a choice and only needs the type', () => {
  assert.deepEqual(TEMPLATE_CHOICES.map((c) => c.value), Object.keys(TEMPLATES));
  const type = CREATE_CLUE_COMMAND.options.find((o) => o.name === 'type');
  assert.equal(type.required, true);
  assert.equal(type.choices.length, 6);
  assert.deepEqual(CREATE_CLUE_COMMAND.options.map((o) => o.name), ['type']);
});

test('task makes one card tag from the tag name and description', () => {
  const [o] = run('task', { tagName: 'leg-3-task', body: 'Find the statue.' });
  assert.equal(o.tag, 'leg-3-task');
  assert.equal(images(o)[0], `${ORIGIN}/img/route-info.webp?v=2`);
  assert.match(cardText(o), /Find the statue\./);
});

test('pit stop title spells out the leg as an ordinal and names the season', () => {
  const [o] = run('pitstop', { location: 'Plaza Mayor', season: '4', image: 'https://x.dev/p.png' }, { leg: 12 });
  assert.match(cardText(o), /TWELFTH LEG OF THE AMAZING JRACE: SEASON 4!/);
  assert.match(cardText(o), /Jroe stands beside you at Plaza Mayor/);
  assert.deepEqual(images(o), ['https://x.dev/p.png', `${ORIGIN}/img/pit-stop.webp?v=2`]);
  assert.equal(o.tag, 'pitstop-l12');
  assert.deepEqual(images(run('pitstop', { location: 'Plaza', season: '4' }, { leg: 1 })[0]), [`${ORIGIN}/img/pit-stop.webp?v=2`]);
});

test('roadblock makes an arrival card and a clue card with the banner and title', () => {
  const [arrival, clue] = run('roadblock', { title: 'Who wants to climb', location: 'Cajón Del Maipo', clue: 'Climb the wall.', image: 'https://x.dev/c.png' });
  assert.equal(arrival.kind, 'card');
  assert.equal(arrival.tag, 'cdm-arrived');
  assert.equal(images(arrival)[0], `${ORIGIN}/img/roadblock.webp?v=2`);
  assert.match(cardText(arrival), /^# WHO WANTS TO CLIMB\n\*Welcome to \*\*[^*]+\*\*, the site of this leg.s roadblock!\*/);
  assert.doesNotMatch(cardText(arrival), /ROADBLOCK:/);
  assert.match(cardText(arrival), /Welcome to \*\*Cajón Del Maipo\*\*/);
  assert.match(cardText(arrival), /`!RB-L3`/);
  assert.match(cardText(arrival), /Only the racer who intends to complete this roadblock may use the command `!RB-L3`\. The other racer may not use the command, participate in the challenge, or help their partner in any capacity\. Breaking these rules will result in severe penalties\./);
  assert.equal(clue.kind, 'card');
  assert.equal(clue.tag, 'rb-l3');
  assert.equal(images(clue)[0], `${ORIGIN}/img/roadblock.webp?v=2`);
  assert.match(cardText(clue), /^# WHO WANTS TO CLIMB\n\*Climb the wall\.\*$/);
});

test('detour makes an arrival card, one card per side, and a plain switch tag', () => {
  const out = run('detour', { tagName: 'cdm-detour', location: 'Cajón Del Maipo', name1: 'Rock', time1: '10 minutes', loc1: 'The Cliff', img1: '', desc1: "where they'll climb it.", name2: 'River', time2: '15 minutes', loc2: 'The Bank', img2: 'https://x.dev/bank.png', desc2: "where they'll raft it.", switchTime: '10 minutes' });
  assert.deepEqual(out.map((o) => o.kind), ['card', 'card', 'card', 'tag']);
  assert.equal(out[0].tag, 'cdm-detour');
  assert.match(cardText(out[0]), /^### ROCK OR RIVER\?/m);
  assert.doesNotMatch(cardText(out[0]), /DETOUR:/);
  assert.match(cardText(out[0]), /ready\.\*\n\*If your team chooses/);
  assert.match(cardText(out[0]), /to travel and begin the other side/);
  assert.doesNotMatch(cardText(out[0]), /10 minutes/);
  assert.match(cardText(out[0]), /`!Rock` and `!River`/);
  assert.match(cardText(out[0]), /`!Switch-L3-Detour`/);
  assert.equal(out[1].tag, 'rock');
  assert.equal(cardText(out[1]), "*In **Rock**, teams will travel 10 minutes to **The Cliff**, where they'll climb it.*\n*If you'd like to perform this side of the detour, use the command `!Rock-Start`.*\n*If you would like to switch, use the command `!Switch-L3-Detour`.*");
  assert.match(cardText(out[2]), /to \[\*\*The Bank\*\*\]\(https:\/\/x\.dev\/bank\.png\), where they'll raft it\./);
  assert.doesNotMatch(cardText(out[1]), /DETOUR/);
  assert.equal(images(out[1])[0], `${ORIGIN}/img/detour.webp?v=2`);
  assert.match(out[3].text, /travel \*\*10 minutes\*\* to the other detour/);
  assert.equal(new Set(out.filter((o) => o.kind === 'card').map((o) => o.key)).size, 3);
});

test('detour switch tag without a time just points at the other arrival command', () => {
  const out = run('detour', { tagName: 'ab-detour', location: 'A B', name1: 'x', time1: '1 minute', loc1: 'P', desc1: 'd', name2: 'y', time2: '1 minute', loc2: 'Q', desc2: 'e' });
  assert.doesNotMatch(out[3].text, /You will travel/);
});

const travelDraft = { tagName: 'cdm-arrived', dest: 'Cajón Del Maipo', transports: ['taxi', 'bus'], t_taxi: '40 to 50 minutes', c_taxi: '$20', t_bus: '100 to 110 minutes', c_bus: '$5' };

test('travel with two transports makes the route card, a travel card and a command per transport', () => {
  const out = run('travel', travelDraft);
  assert.deepEqual(out.map((o) => o.kind), ['card', 'card', 'extra', 'extra']);
  assert.match(cardText(out[0]), /Make your way by taxi or bus to \*\*Cajón Del Maipo\*\*/);
  assert.match(cardText(out[0]), /`!CDM-Travel`/);
  assert.equal(out[1].tag, 'cdm-travel');
  assert.match(cardText(out[1]), /TAXI/);
  assert.ok(cardText(out[1]).indexOf('TAXI') < cardText(out[1]).indexOf('BUS'), 'most expensive first');
  assert.match(out[2].text, /!CDM-Taxi/);
});

test('travel with one transport skips the travel card and only gives its command', () => {
  const out = run('travel', { ...travelDraft, transports: ['taxi'] });
  assert.deepEqual(out.map((o) => o.kind), ['card', 'extra']);
});

test('travel without transports says to use the arrived command', () => {
  const [o] = run('travel', { tagName: 'x', dest: 'Dopamine Land', transports: [] });
  assert.match(cardText(o), /Make your way to \*\*Dopamine Land\*\* to receive/);
  assert.match(cardText(o), /`!DL-Arrived`/);
});

test('travel without a destination is just the extra text', () => {
  const [o] = run('travel', { tagName: 'x', extra: 'Beware of dogs.' });
  assert.match(cardText(o), /Beware of dogs\./);
  assert.doesNotMatch(cardText(o), /Make your way/);
});

test('output blocks show the tag text with the link for cards, plain text for tags', () => {
  const [arrival, clue] = run('roadblock', { title: 't', location: 'A B', clue: 'Do it.' });
  const card = outputBlock(arrival, 'https://okbot.example.dev/route/abc');
  assert.match(card, /tag \+ ab-arrived \[.*\]\(https:\/\/okbot\.example\.dev\/route\/abc\?v=\{unix\}\)/);
  assert.doesNotMatch(card, /Preview/);
  assert.match(outputBlock(clue, 'https://okbot.example.dev/route/def'), /tag \+ rb-l3 \[.*\]\(https:\/\/okbot\.example\.dev\/route\/def\?v=\{unix\}\)/);
  assert.match(outputBlock({ kind: 'tag', tag: 'x', label: 'L', text: 'Do it.' }, ''), /tag \+ x Do it\./);
});

test('every card from a full draft fits the link-preview limit', () => {
  const big = 'x'.repeat(400);
  const drafts = {
    detour: { location: 'A B', name1: 'one', time1: '5 min', loc1: 'X', desc1: big, name2: 'two', time2: '5 min', loc2: 'Y', desc2: big, switchTime: '5 min' },
    roadblock: { title: 'T', location: 'A B', clue: 'c', image: 'https://example.com/i.png' },
    pitstop: { location: 'A B', season: '4', image: 'https://example.com/i.png' },
    travel: travelDraft,
    task: { tagName: 't', body: big },
  };
  for (const [id, fields] of Object.entries(drafts)) {
    for (const o of run(id, fields).filter((x) => x.kind === 'card')) assert.ok(embedBytes(o.embed) <= MAX_EMBED_BYTES, `${id} ${o.key}`);
  }
});

test('a tag name with spaces becomes one hyphenated word', () => {
  const [o] = run('task', { tagName: ' Test  Task ', body: 'Do it' });
  assert.equal(o.tag, 'Test-Task');
});

test('the travel info card has the old tag layout: emoji both sides, bold underlined name, italic lines, dearest first', () => {
  const out = run('travel', { tagName: 'cdm', dest: 'Cajón del Maipo', transports: ['bus', 'taxi'], t_taxi: '30 min', c_taxi: '$20', t_bus: '1 hour', c_bus: '$5' }, { tag: 'cdm' });
  const info = out.find((o) => o.label === 'Travel tag');
  const t = cardText(info);
  assert.match(t, /# TRAVEL INFO/);
  assert.ok(t.indexOf('## 🚕  **__TAXI__**  🚕') < t.indexOf('## 🚌  **__BUS__**  🚌'));
  assert.match(t, /\*Duration of Ride: 30 min\*\n\*Cost: \$20\*/);
  assert.match(t, /^\*If you would like to .*\.\*$/m);
  assert.match(cardText(out[0]), /\*Make your way by bus or taxi to \*\*Cajón del Maipo\*\* to receive your next clue\.\*/);
});

test('edit_clue takes just the tag, with suggestions as you type', () => {
  assert.deepEqual(EDIT_CLUE_COMMAND.options.map((o) => [o.name, o.required, o.autocomplete]), [['tag', true, true]]);
});

test('travel still reads a time and cost saved the old way, in one box with a divider', () => {
  const out = run('travel', { ...travelDraft, t_taxi: '40 minutes | $20', c_taxi: undefined, t_bus: '100 minutes', c_bus: '$5' });
  const info = cardText(out[1]);
  assert.match(info, /\*Duration of Ride: 40 minutes\*\n\*Cost: \$20\*/);
  assert.match(info, /\*Duration of Ride: 100 minutes\*\n\*Cost: \$5\*/);
});

test('a transport box holds the time, then the cost after a comma', async () => {
  const { parseTimeCost } = await import('../src/templates/travel.js');
  assert.deepEqual(parseTimeCost('40 to 50 minutes, $20'), { time: '40 to 50 minutes', cost: '$20' });
  assert.deepEqual(parseTimeCost('1 hour, 20 min'), { time: '1 hour, 20 min', cost: '' });
  assert.deepEqual(parseTimeCost('1 hour, 20 min, $15'), { time: '1 hour, 20 min', cost: '$15' });
  assert.deepEqual(parseTimeCost('10 minutes, free'), { time: '10 minutes', cost: 'free' });
  assert.deepEqual(parseTimeCost('30 minutes'), { time: '30 minutes', cost: '' });
  assert.deepEqual(parseTimeCost('40 minutes | $7'), { time: '40 minutes', cost: '$7' });
  assert.deepEqual(parseTimeCost(undefined), { time: '', cost: '' });
});

test('travel reads the one-box time and cost into the Travel card, dearest first', () => {
  const out = run('travel', { tagName: 'cdm', dest: 'Cajón del Maipo', transports: ['bus', 'taxi'], t_taxi: '30 min, $20', t_bus: '1 hour, 20 min, $5' }, { tag: 'cdm' });
  const t = cardText(out.find((o) => o.label === 'Travel tag'));
  assert.ok(t.indexOf('TAXI') < t.indexOf('BUS'));
  assert.match(t, /\*Duration of Ride: 30 min\*\n\*Cost: \$20\*/);
  assert.match(t, /\*Duration of Ride: 1 hour, 20 min\*\n\*Cost: \$5\*/);
});

test('a leg start with ways to get there also makes the touchdown card, showing the airport picture', () => {
  const d = {
    leg: '5', depCity: 'A, X', destCity: 'Salzburg, Austria', site: 'Mirabell Gardens', airport: 'Salzburg Airport', flightTime: '2 hours',
    airportImage: 'https://x.com/a.png', transports: ['taxi', 'bus'], t_taxi: '10 min, $5', t_bus: '20 min, $1',
  };
  const out = run('legstart', d, { leg: 5 });
  assert.equal(out[0].key, 'leg-5');
  const card = out.find((o) => o.key === 'touchdown:Salzburg-Touchdown');
  assert.equal(card.tag, 'Salzburg-Touchdown');
  const all = card.embed.component.components;
  const parts = all.filter((c) => c.type === 10).map((c) => c.content);
  assert.equal(parts[0], '*You have officially touched down at **Salzburg Airport**!*');
  assert.equal(all[2].items[0].media.url, 'https://x.com/a.png');
  assert.match(parts[1], /Make your way by taxi or bus to \*\*Mirabell Gardens\*\*/);
  assert.ok(!run('legstart', { ...d, airportImage: '' }, { leg: 5 }).find((o) => o.key === 'touchdown:Salzburg-Touchdown').embed.component.components.some((c, i) => i > 0 && c.type === 12));
  assert.ok(!run('legstart', { ...d, transports: [] }, { leg: 5 }).some((o) => o.key?.startsWith('touchdown')));
  assert.ok(!run('legstart', { ...d, site: '' }, { leg: 5 }).some((o) => o.key?.startsWith('touchdown')));
});

test('a task card shows its optional image under the text', () => {
  const [plain] = run('task', { tagName: 'x', body: 'Do it.' });
  assert.ok(!plain.embed.component.components.slice(1).some((c) => c.type === 12));
  const [pic] = run('task', { tagName: 'x', body: 'Do it.', image: 'https://x.dev/t.png' });
  assert.equal(pic.embed.component.components.at(-1).items[0].media.url, 'https://x.dev/t.png');
});

test('task text is italic, each line on its own', () => {
  const [o] = run('task', { tagName: 'x', body: 'First line.\n\nSecond line.' });
  assert.equal(o.embed.component.components[1].content, '*First line.*\n\n*Second line.*');
});

test('roadblock and detour body text is italic, headings are not', () => {
  const rb = run('roadblock', { title: 'Climb', location: 'Cajón', clue: 'Climb it.\nTwice.' });
  const lines = (o) => o.embed.component.components.filter((c) => c.type === 10).flatMap((c) => c.content.split('\n')).filter((l) => l && !l.startsWith('#'));
  for (const o of rb) for (const l of lines(o)) assert.ok(/^\*.*\*$/.test(l), l);
});

test('the custom travel option has its own emoji box (or an emoji before the name), used on the Travel Info card', () => {
  const d = { tagName: 'mg', dest: 'Mirabell Gardens', transports: ['taxi', 'custom'], custom: 'tuk tuk', customEmoji: '🛺', t_taxi: '10 min, $5', t_tuk: '', 't_tuk tuk': '20 min, $2' };
  const out = run('travel', d);
  const info = out.find((o) => o.key === 'travel:mg:info');
  const all = info.embed.component.components.map((c) => c.content ?? '').join('\n');
  assert.match(all, /## 🛺  \*\*__TUK TUK__\*\*  🛺/);
  assert.match(out[0].embed.component.components.map((c) => c.content ?? '').join('\n'), /by taxi or tuk tuk/);
  const typed = run('travel', { ...d, customEmoji: '', custom: '🛺 tuk tuk' }).find((o) => o.key === 'travel:mg:info');
  assert.match(typed.embed.component.components.map((c) => c.content ?? '').join('\n'), /## 🛺  /);
  const plain = run('travel', { ...d, customEmoji: '' }).find((o) => o.key === 'travel:mg:info');
  assert.match(plain.embed.component.components.map((c) => c.content ?? '').join('\n'), /## 🗺️  \*\*__TUK TUK__\*\*  🗺️/);
});

test('the custom emoji can be typed as a :name:, as a server emoji, or pasted; anything else is warned about', async () => {
  const { emojiFrom, emojiWarning } = await import('../src/templates/travel.js');
  assert.equal(emojiFrom(':auto_rickshaw:'), '🛺');
  assert.equal(emojiFrom(' :TAXI: '), '🚕');
  assert.equal(emojiFrom('🛺'), '🛺');
  assert.equal(emojiFrom('<:tuk:123456>'), '<:tuk:123456>');
  assert.equal(emojiFrom(':nope_not_real:'), '');
  assert.equal(emojiFrom('hello'), '');
  assert.equal(emojiWarning({ customEmoji: '' }), '');
  assert.equal(emojiWarning({ customEmoji: ':taxi:' }), '');
  assert.match(emojiWarning({ customEmoji: ':nope:' }), /don't know the emoji `:nope:`/);
  const d = { tagName: 'mg', dest: 'MG', transports: ['taxi', 'custom'], custom: 'tuk tuk', customEmoji: ':auto_rickshaw:', t_taxi: '1 min, $1', 't_tuk tuk': '2 min, $2' };
  const info = run('travel', d).find((o) => o.key === 'travel:mg:info');
  assert.match(info.embed.component.components.map((c) => c.content ?? '').join('\n'), /## 🛺  /);
});

test('the touchdown tag is the destination city with spaces as hyphens, plus -Touchdown', () => {
  const d = { leg: '5', depCity: 'A, X', destCity: 'New Delhi, India', site: 'Humayuns Kabir Van', airport: 'DEL', flightTime: '2 hours', transports: ['taxi'], t_taxi: '10 min, $5' };
  const card = run('legstart', d, { leg: 5 }).find((o) => o.key?.startsWith('touchdown:'));
  assert.equal(card.tag, 'New-Delhi-Touchdown');
});
