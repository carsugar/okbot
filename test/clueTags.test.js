import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tagOf, sameTag } from '../src/clueTags.js';
import { TEMPLATES } from '../src/templates/index.js';

test('the main tag of a saved clue is worked out from its draft', () => {
  const pit = { ...TEMPLATES.pitstop.initial({ leg: 3 }), type: 'pitstop', location: 'Plaza', season: '4' };
  assert.equal(tagOf(pit), 'test-pitstop-l3');
  const task = { ...TEMPLATES.task.initial({}), type: 'task', tagName: 'Find Statue', body: 'x' };
  assert.equal(tagOf(task), 'test-Find-Statue');
});

test('a draft that is not ready, or of an unknown type, has no tag', () => {
  assert.equal(tagOf({ ...TEMPLATES.pitstop.initial({ leg: 3 }), type: 'pitstop' }), null);
  assert.equal(tagOf({ type: 'nope' }), null);
  assert.equal(tagOf(undefined), null);
});

test('a tag matches with or without the test- prefix and in any case', () => {
  assert.ok(sameTag('test-pitstop-l3', 'pitstop-l3'));
  assert.ok(sameTag('test-Find-Statue', 'TEST-find-statue'));
  assert.ok(!sameTag('test-pitstop-l3', 'pitstop-l4'));
});
