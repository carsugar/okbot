import { test } from 'node:test';
import assert from 'node:assert/strict';
import { imageRefs, withAttachmentUrls } from '../src/attachments.js';
import { parseCards, svgFor } from '../src/cardImage.js';

const gallery = (url) => ({ type: 12, items: [{ media: { url } }] });
const O = 'https://x.dev';
const parts = [
  { type: 10, content: 'hi' },
  gallery(`${O}/mp/board/AS2H3D4C5S6H7D8C9STHJDQCKSAH2D3C4S.png`),
  gallery(`${O}/mp/hand/AS2H3D4C5S.png`),
  gallery(`${O}/mp/hand/AS2H3D4C5S.png`),
  gallery('https://other.dev/header.png'),
];

test('only our own card pictures are found, once each, with a file name', () => {
  const refs = imageRefs(parts);
  assert.deepEqual(refs.map((r) => r.filename), ['board-AS2H3D4C5S6H7D8C9STHJDQCKSAH2D3C4S.png', 'hand-AS2H3D4C5S.png']);
  assert.deepEqual(refs.map((r) => r.kind), ['board', 'hand']);
  assert.equal(refs[1].cards.length, 5);
});

test('pictures that are attached are referenced by attachment://, others are left alone', () => {
  const out = withAttachmentUrls(parts, new Set(['hand-AS2H3D4C5S.png']));
  assert.equal(out[1].items[0].media.url, parts[1].items[0].media.url);
  assert.equal(out[2].items[0].media.url, 'attachment://hand-AS2H3D4C5S.png');
  assert.equal(out[3].items[0].media.url, 'attachment://hand-AS2H3D4C5S.png');
  assert.equal(out[4].items[0].media.url, 'https://other.dev/header.png');
  assert.equal(parts[2].items[0].media.url.startsWith('https'), true);
});

test('the shared cards picture exists for exactly three cards', () => {
  assert.ok(svgFor('shared', parseCards('KSKDKC')));
  assert.equal(svgFor('shared', parseCards('KSKD')), null);
});
