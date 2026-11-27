import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseReply } from '../src/choose.js';

test('choose lists every choice, then always answers I choose Dumb Fick', () => {
  assert.equal(chooseReply('pizza, tacos ,, sushi'), 'Choosing between:\n• pizza\n• tacos\n• sushi\n\n**I choose Dumb Fick**');
  assert.equal(chooseReply(''), '**I choose Dumb Fick**');
});
