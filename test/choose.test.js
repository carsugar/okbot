import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseReply } from '../src/choose.js';

test('choose lists every choice, then always answers Anyone but Carling', () => {
  assert.equal(chooseReply('pizza, tacos ,, sushi'), 'Choosing between:\n• pizza\n• tacos\n• sushi\n\n**Anyone but Carling**');
  assert.equal(chooseReply(''), '**Anyone but Carling**');
});
