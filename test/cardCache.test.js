import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cachedPng } from '../src/cardCache.js';
import { parseCards } from '../src/cardImage.js';

const fakeEnv = () => {
  const kept = new Map();
  return { getImage: async (k) => kept.get(k) ?? null, saveImage: async (k, v) => kept.set(k, v) };
};
const hidden = parseCards('AS2H3D');

test('a picture is drawn once, then read back from storage', async () => {
  const store = fakeEnv();
  let draws = 0;
  const render = async () => { draws += 1; return new Uint8Array([1, 2, 3]); };
  await cachedPng(store, 'hidden', hidden, render);
  const again = await cachedPng(store, 'hidden', hidden, render);
  assert.equal(draws, 1);
  assert.deepEqual([...again], [1, 2, 3]);
});

test('cards that do not fit the kind give no picture and draw nothing', async () => {
  const store = fakeEnv();
  assert.equal(await cachedPng(store, 'board', hidden, async () => assert.fail('drew')), null);
});
