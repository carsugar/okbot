import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLegStart, legStartEmbed, legTagText, mimuAutoresponder, newSlug, routeInfoBanner, INVISIBLE } from '../src/legStartCard.js';
import { embedBytes, MAX_EMBED_BYTES } from '../src/routeEmbedPage.js';

const IMAGE = 'https://example.com/header.webp';
const fields = {
  leg: '3',
  departure: 'Machu Picchu, Peru | https://example.com/dep.png',
  destination: 'Santiago, Chile | Cajón del Maipo | SCL Airport',
  money: '$15',
  flightTime: '3 hours',
};
const texts = (embed) => embed.component.components.filter((c) => c.type === 10).map((c) => c.content).join('\n');

test('parseLegStart splits the pipe fields and normalizes money and flight time', () => {
  const d = parseLegStart(fields);
  assert.equal(d.leg, '3');
  assert.equal(d.departure, 'Machu Picchu, Peru');
  assert.equal(d.destination, 'Santiago, Chile');
  assert.equal(d.site, 'Cajón del Maipo');
  assert.equal(d.airport, 'SCL Airport');
  assert.equal(d.country, 'Chile');
  assert.equal(d.moneyDisplay, '$15');
  assert.equal(d.flightTime, '3 hour flight');
  assert.equal(d.moneyCommand, '!Claim-Leg3-Money');
  assert.equal(d.touchdownCommand, '!Santiago-Touchdown');
});

test('parseLegStart copes with missing optional parts', () => {
  const d = parseLegStart({ ...fields, destination: 'Lima', money: '', departure: 'Cusco' });
  assert.equal(d.site, '');
  assert.equal(d.airport, '');
  assert.equal(d.country, 'Lima');
  assert.equal(d.moneyDisplay, '');
  assert.equal(d.touchdownCommand, '!Lima-Touchdown');
});

test('flight time that already says flight is left alone', () => {
  assert.equal(parseLegStart({ ...fields, flightTime: '3 hours flight' }).flightTime, '3 hour flight');
});

test('card is one container: the banner image is the title, then the leg text', () => {
  const embed = legStartEmbed(parseLegStart(fields), IMAGE);
  const parts = embed.component.components;
  assert.equal(embed.component.type, 17);
  assert.equal(parts[0].type, 12);
  assert.equal(parts[0].items[0].media.url, IMAGE);
  assert.doesNotMatch(texts(embed), /ROUTE INFO|LEG 3 START/);
  const t = texts(embed);
  assert.match(t, /\*\*Machu Picchu, Peru\*\*/);
  assert.match(t, /\*\*Santiago, Chile!\*\*/);
  assert.match(t, /\*\*3 hour flight\*\*/);
  assert.match(t, /\*\*Cajón del Maipo\*\*/);
  assert.match(t, /`!Claim-Leg3-Money`/);
  assert.match(t, /`!Santiago-Touchdown`.*SCL Airport/);
});

test('no money means no money section; no airport changes the touchdown line', () => {
  const t = texts(legStartEmbed(parseLegStart({ ...fields, money: '', destination: 'Santiago, Chile | Cajón del Maipo' }), IMAGE));
  assert.doesNotMatch(t, /Claim-Leg/);
  assert.match(t, /officially land\./);
});

test('card stays under 3,000 bytes for typical input and rejects nothing silently', () => {
  assert.ok(embedBytes(legStartEmbed(parseLegStart(fields), IMAGE)) < MAX_EMBED_BYTES);
});

test('worst-case multibyte field lengths are reported as too big, not truncated', () => {
  const huge = parseLegStart({ ...fields, departure: '€'.repeat(600), destination: `${'€'.repeat(130)} | ${'€'.repeat(130)} | ${'€'.repeat(130)}` });
  assert.ok(embedBytes(legStartEmbed(huge, IMAGE)) > MAX_EMBED_BYTES);
});

test('tag text is the carlbot mention, tag name and an invisible-text link', () => {
  const t = legTagText({ carlbotMention: '<@1>', tagName: 'test-leg-3', url: 'https://x.dev/route/abc' });
  assert.equal(t, `<@1> tag + test-leg-3 [${INVISIBLE}](https://x.dev/route/abc)`);
  assert.equal(INVISIBLE, '⠀');
});

test('mimu autoresponder only exists when there is money', () => {
  assert.equal(mimuAutoresponder(parseLegStart({ ...fields, money: '' })), null);
  assert.equal(
    mimuAutoresponder(parseLegStart(fields)),
    '/autoresponder add trigger:!Claim-Leg3-Money reply:$15 has been added to your account! {modifybal: 15}',
  );
});

test('newSlug is 12 url-safe characters from nine bytes', () => {
  assert.match(newSlug(new Uint8Array(9).fill(255)), /^[A-Za-z0-9_-]{12}$/);
  assert.notEqual(newSlug(new Uint8Array(9).fill(1)), newSlug(new Uint8Array(9).fill(2)));
});

test('the departure image is parsed from the form', () => {
  assert.equal(parseLegStart(fields).departureImage, 'https://example.com/dep.png');
  assert.equal(parseLegStart({ ...fields, departure: 'Cusco' }).departureImage, '');
});

test('the departure image shows in its own gallery right under the make-your-way line', () => {
  const parts = legStartEmbed(parseLegStart(fields), IMAGE).component.components;
  const i = parts.findIndex((c) => c.type === 10 && c.content.startsWith('Make your way'));
  assert.equal(parts[i + 1].type, 12);
  assert.equal(parts[i + 1].items[0].media.url, 'https://example.com/dep.png');
});

test('no departure image means no second gallery', () => {
  const parts = legStartEmbed(parseLegStart({ ...fields, departure: 'Cusco' }), IMAGE).component.components;
  assert.equal(parts.filter((c) => c.type === 12).length, 1);
});

test('the banner is the Route Info image served by the Worker itself', () => {
  assert.equal(routeInfoBanner('https://x.dev'), 'https://x.dev/img/route-info.webp');
});
