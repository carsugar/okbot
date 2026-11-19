import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tagOf, sameTag, clueLabel } from '../src/clueTags.js';
import { TEMPLATES } from '../src/templates/index.js';

test('the main tag of a saved clue is worked out from its draft', () => {
  const pit = { ...TEMPLATES.pitstop.initial({ leg: 3 }), type: 'pitstop', location: 'Plaza', season: '4' };
  assert.equal(tagOf(pit), 'pitstop-l3');
  const task = { ...TEMPLATES.task.initial({}), type: 'task', tagName: 'Find Statue', body: 'x' };
  assert.equal(tagOf(task), 'Find-Statue');
});

test('a draft that is not ready, or of an unknown type, has no tag', () => {
  assert.equal(tagOf({ ...TEMPLATES.pitstop.initial({ leg: 3 }), type: 'pitstop' }), null);
  assert.equal(tagOf({ type: 'nope' }), null);
  assert.equal(tagOf(undefined), null);
});

test('a tag matches with or without the test- prefix and in any case', () => {
  assert.ok(sameTag('pitstop-l3', 'pitstop-l3'));
  assert.ok(sameTag('test-Find-Statue', 'TEST-find-statue'));
  assert.ok(!sameTag('pitstop-l3', 'pitstop-l4'));
});

test('a saved clue reads with its leg, kind and what it is about', () => {
  const rb = { ...TEMPLATES.roadblock.initial({ leg: 5 }), type: 'roadblock', title: 'Who wants to climb', location: 'Cajón del Maipo', clue: 'x' };
  assert.equal(clueLabel(rb), 'Leg 5 · Roadblock · Who wants to climb (Cajón del Maipo)');
  const pit = { ...TEMPLATES.pitstop.initial({ leg: 3 }), type: 'pitstop', location: 'Embalse Yeso' };
  assert.equal(clueLabel(pit), 'Leg 3 · Pit Stop · Embalse Yeso');
  const leg = { ...TEMPLATES.legstart.initial({ leg: 2 }), type: 'legstart', depCity: 'Santiago, Chile', destCity: 'Lima, Peru' };
  assert.equal(clueLabel(leg), 'Leg 2 · Leg Start · Santiago, Chile to Lima, Peru');
  const travel = { ...TEMPLATES.travel.initial({}), type: 'travel', tagName: 'cdm', dest: 'Cajón Del Maipo' };
  assert.equal(clueLabel(travel), 'Travel · Cajón Del Maipo');
  assert.ok(clueLabel({ ...rb, title: 'x'.repeat(200) }).length <= 100);
  assert.equal(clueLabel({ type: 'nope' }), '');
});
