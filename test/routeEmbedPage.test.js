import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sampleRouteInfoEmbed, embedPageHtml, embedBytes, MAX_EMBED_BYTES } from '../src/routeEmbedPage.js';

const embed = sampleRouteInfoEmbed();
const html = embedPageHtml(embed, { title: 'Route Info: Leg 3', description: 'Sample' });
const countComponents = (c) => 1 + (c.components ?? []).reduce((n, k) => n + countComponents(k), 0);

test('the page carries the embed JSON in the head, parseable and unchanged', () => {
  const m = html.match(/<head>[\s\S]*<script id="discord:component-embed" type="application\/json">([\s\S]*?)<\/script>[\s\S]*<\/head>/);
  assert.ok(m, 'script tag in head');
  assert.deepEqual(JSON.parse(m[1]), embed);
});

test('the page has Open Graph fallback tags', () => {
  assert.match(html, /<meta property="og:title" content="Route Info: Leg 3">/);
  assert.match(html, /og:description/);
});

test('embed has a single top-level container, within 40 components and 3,000 bytes', () => {
  assert.equal(embed.component.type, 17);
  assert.ok(countComponents(embed.component) <= 40);
  assert.ok(embedBytes(embed) <= MAX_EMBED_BYTES, `bytes ${embedBytes(embed)}`);
});

test('a closing script tag inside text cannot break out of the page', () => {
  const evil = embedPageHtml({ component: { type: 17, components: [{ type: 10, content: '</script><b>x' }] } }, { title: 't', description: 'd' });
  assert.equal(evil.split('</script>').length, 2);
});
