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
  assert.ok(CREATE_CLUE_COMMAND.options.filter((o) => o.name !== 'type').every((o) => !o.required));
});

test('task makes one card tag from the tag name and description', () => {
  const [o] = run('task', { tagName: 'leg-3-task', body: 'Find the statue.' });
  assert.equal(o.tag, 'test-leg-3-task');
  assert.equal(images(o)[0], `${ORIGIN}/img/route-info.webp?v=2`);
  assert.match(cardText(o), /Find the statue\./);
});

test('pit stop title spells out the leg as an ordinal and names the season', () => {
  const [o] = run('pitstop', { location: 'Plaza Mayor', season: '4', image: 'https://x.dev/p.png' }, { leg: 12 });
  assert.match(cardText(o), /TWELFTH LEG OF THE AMAZING JRACE: SEASON 4!/);
  assert.match(cardText(o), /Jroe stands beside you at Plaza Mayor/);
  assert.deepEqual(images(o), ['https://x.dev/p.png', `${ORIGIN}/img/pit-stop.webp?v=2`]);
  assert.equal(o.tag, 'test-pitstop-l12');
  assert.deepEqual(images(run('pitstop', { location: 'Plaza', season: '4' }, { leg: 1 })[0]), [`${ORIGIN}/img/pit-stop.webp?v=2`]);
});

test('roadblock makes an arrival card and a plain clue tag', () => {
  const [arrival, clue] = run('roadblock', { title: 'Who wants to climb', location: 'Cajón Del Maipo', clue: 'Climb the wall.', image: 'https://x.dev/c.png' });
  assert.equal(arrival.kind, 'card');
  assert.equal(arrival.tag, 'test-cdm-arrived');
  assert.equal(images(arrival)[0], `${ORIGIN}/img/roadblock.webp?v=2`);
  assert.match(cardText(arrival), /ROADBLOCK: WHO WANTS TO CLIMB/);
  assert.match(cardText(arrival), /Welcome to \*\*Cajón Del Maipo\*\*/);
  assert.match(cardText(arrival), /`!RB-L3`/);
  assert.equal(clue.kind, 'tag');
  assert.equal(clue.tag, 'test-rb-l3');
  assert.equal(clue.text, 'Climb the wall.');
});

test('detour makes an arrival card, one card per side, and a plain switch tag', () => {
  const out = run('detour', { location: 'Cajón Del Maipo', name1: 'Rock', desc1: 'Climb it.', name2: 'River', desc2: 'Raft it.', switchTime: '10 minutes' });
  assert.deepEqual(out.map((o) => o.kind), ['card', 'card', 'card', 'tag']);
  assert.equal(out[0].tag, 'test-cdm-arrived');
  assert.match(cardText(out[0]), /DETOUR: ROCK OR RIVER\?/);
  assert.match(cardText(out[0]), /`!Rock` and `!River`/);
  assert.match(cardText(out[0]), /`!Switch-L3-Detour`/);
  assert.equal(out[1].tag, 'test-rock');
  assert.match(cardText(out[1]), /Climb it\./);
  assert.equal(images(out[1])[0], `${ORIGIN}/img/detour.webp?v=2`);
  assert.match(out[3].text, /travel \*\*10 minutes\*\* to the other detour/);
  assert.equal(new Set(out.filter((o) => o.kind === 'card').map((o) => o.key)).size, 3);
});

test('detour switch tag without a time just points at the other arrival command', () => {
  const out = run('detour', { location: 'A B', name1: 'x', desc1: 'd', name2: 'y', desc2: 'e' });
  assert.doesNotMatch(out[3].text, /You will travel/);
});

const travelDraft = { tagName: 'cdm-arrived', dest: 'Cajón Del Maipo', transports: ['taxi', 'bus'], t_taxi: '40 to 50 minutes', c_taxi: '$20', t_bus: '100 to 110 minutes', c_bus: '$5' };

test('travel with two transports makes the route card, a travel card and a command per transport', () => {
  const out = run('travel', travelDraft);
  assert.deepEqual(out.map((o) => o.kind), ['card', 'card', 'extra', 'extra']);
  assert.match(cardText(out[0]), /Make your way by taxi or bus to \*\*Cajón Del Maipo\*\*/);
  assert.match(cardText(out[0]), /`!CDM-Travel`/);
  assert.equal(out[1].tag, 'test-cdm-travel');
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
  assert.match(card, /tag \+ test-ab-arrived \[.*\]\(https:\/\/okbot\.example\.dev\/route\/abc\?v=\{unix\}\)/);
  assert.match(card, /Preview: https:\/\/okbot\.example\.dev\/route\/abc/);
  assert.match(outputBlock(clue, ''), /tag \+ test-rb-l3 Do it\./);
});

test('every card from a full draft fits the link-preview limit', () => {
  const big = 'x'.repeat(400);
  const drafts = {
    detour: { location: 'A B', name1: 'one', desc1: big, name2: 'two', desc2: big, switchTime: '5 min' },
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
  assert.equal(o.tag, 'test-Test-Task');
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
