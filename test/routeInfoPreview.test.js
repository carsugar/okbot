import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routeInfoPreviewMessage } from '../src/routeInfoPreview.js';

const msg = routeInfoPreviewMessage('https://example.com/h.webp');

test('preview is an ephemeral Components V2 message with no content or embeds', () => {
  assert.equal(msg.flags, (1 << 15) | (1 << 6));
  assert.equal(msg.content, undefined);
  assert.equal(msg.embeds, undefined);
});

test('preview is one container with a thumbnail section and separators', () => {
  assert.equal(msg.components.length, 1);
  const box = msg.components[0];
  assert.equal(box.type, 17);
  assert.equal(box.components[0].type, 9);
  assert.equal(box.components[0].accessory.media.url, 'https://example.com/h.webp');
  assert.ok(box.components.some((c) => c.type === 14));
});
