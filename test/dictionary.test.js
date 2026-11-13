import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lookupWord } from '../src/dictionary.js';

const reply = (words) => async () => ({ ok: true, json: async () => words.map((word) => ({ word, score: 1 })) });

test('top result equal to the word (any case) is recognized', async () => {
  assert.deepEqual(await lookupWord('Rain', reply(['rain', 'train'])), { known: true, suggestions: [] });
});

test('different top result is unrecognized with at most two suggestions, never the word itself', async () => {
  const result = await lookupWord('raibn', reply(['rain', 'raibn', 'rabin', 'ruin']));
  assert.deepEqual(result, { known: false, suggestions: ['rain', 'rabin'] });
});

test('empty result is unrecognized with no suggestions', async () => {
  assert.deepEqual(await lookupWord('xqzvtk', reply([])), { known: false, suggestions: [] });
});

test('fails open when fetch rejects', async () => {
  const result = await lookupWord('rain', async () => { throw new Error('network down'); });
  assert.deepEqual(result, { known: true, suggestions: [] });
});

test('fails open on a non-200 response', async () => {
  const result = await lookupWord('rain', async () => ({ ok: false, json: async () => [] }));
  assert.deepEqual(result, { known: true, suggestions: [] });
});

test('fails open on malformed JSON', async () => {
  const result = await lookupWord('rain', async () => ({ ok: true, json: async () => { throw new SyntaxError('bad'); } }));
  assert.deepEqual(result, { known: true, suggestions: [] });
});

test('fails open when the request outlives its timeout signal', async () => {
  const hang = (url, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason)));
  const started = Date.now();
  const result = await lookupWord('rain', hang);
  assert.deepEqual(result, { known: true, suggestions: [] });
  assert.ok(Date.now() - started < 3000);
});

test('requests only the word and a result cap, nothing else', async () => {
  let requested;
  await lookupWord('raibn', async (url) => { requested = new URL(url); return { ok: true, json: async () => [] }; });
  assert.equal(requested.origin + requested.pathname, 'https://api.datamuse.com/words');
  assert.deepEqual([...requested.searchParams.keys()].sort(), ['max', 'sp']);
  assert.equal(requested.searchParams.get('sp'), 'raibn');
  assert.equal(requested.searchParams.get('max'), '4');
});
