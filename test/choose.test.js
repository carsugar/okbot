import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseReply } from '../src/choose.js';

test('choose lists every choice, then always answers Carling did not do the murder', () => {
  assert.equal(chooseReply('pizza, tacos ,, sushi'), 'Choosing between:\n• pizza\n• tacos\n• sushi\n\n**Carling did not do the murder**');
  assert.equal(chooseReply(''), '**Carling did not do the murder**');
});
