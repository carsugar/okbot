import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLegStart, bannerImage } from '../src/legStartCard.js';
import { emptyDraft, draftFromSaved, draftToLeg, applyModal, sectionModal, panelData, BANNERS } from '../src/legEditorPanel.js';

const ORIGIN = 'https://okbot.example.dev';
const ID = '1234567890123456789';
const saved = parseLegStart({
  leg: '3',
  departure: 'Machu Picchu, Peru | https://example.com/dep.png',
  destination: 'Santiago, Chile | Cajón del Maipo | SCL Airport',
  money: '$15',
  flightTime: '3 hours',
});
const ready = () => draftFromSaved('g1', saved);
const flat = (panel) => panel.components.flatMap((c) => (c.type === 1 ? c.components : [c]));
const allIds = (panel) => flat(panel).filter((c) => c.custom_id).map((c) => c.custom_id);
const buttons = (panel) => flat(panel).filter((c) => c.type === 2);
const saveButton = (panel) => buttons(panel).find((b) => b.custom_id.startsWith('le:save:'));

test('bannerImage points at the hosted file for each banner and defaults to Route Info', () => {
  assert.equal(bannerImage(ORIGIN), `${ORIGIN}/img/route-info.webp`);
  assert.equal(bannerImage(ORIGIN, 'detour'), `${ORIGIN}/img/detour.webp`);
  assert.equal(bannerImage(ORIGIN, 'roadblock'), `${ORIGIN}/img/roadblock.webp`);
});

test('a saved leg becomes a draft and back into the same card data', () => {
  const back = draftToLeg(ready());
  assert.deepEqual({ ...back, banner: undefined }, { ...saved, banner: undefined });
  assert.equal(ready().depImage, 'https://example.com/dep.png');
  assert.equal(ready().flightTime, '3 hour');
});

test('an empty draft has a leg number and the Route Info banner', () => {
  const d = emptyDraft('g1', '4');
  assert.equal(d.leg, '4');
  assert.equal(d.banner, 'route-info');
});

test('a modal submit changes only its own section, trimmed', () => {
  const values = { depCity: '  Cusco, Peru ', depImage: '' };
  const next = applyModal(ready(), 'departure', (id) => values[id]);
  assert.equal(next.depCity, 'Cusco, Peru');
  assert.equal(next.depImage, '');
  assert.equal(next.destCity, 'Santiago, Chile');
  assert.equal(next.money, '$15');
});

test('section modals are pre-filled, within Discord limits, and named for the draft and section', () => {
  for (const section of ['departure', 'destination', 'moneyflight']) {
    const m = sectionModal(ID, section, ready());
    assert.equal(m.custom_id, `le_modal:${ID}:${section}`);
    assert.ok(m.title.length <= 45);
    assert.ok(m.components.length >= 1 && m.components.length <= 5);
    for (const { components: [c] } of m.components) {
      assert.ok(c.label.length <= 45);
      assert.ok((c.value ?? '').length <= c.max_length);
    }
  }
  const dest = sectionModal(ID, 'destination', ready()).components.map((r) => r.components[0]);
  assert.deepEqual(dest.map((c) => c.value), ['Santiago, Chile', 'Cajón del Maipo', 'SCL Airport']);
});

test('a ready draft shows the card, the byte count and an enabled Save button', () => {
  const p = panelData(ID, ready(), ORIGIN);
  assert.equal(p.flags & (1 << 15), 1 << 15);
  assert.ok(p.components.some((c) => c.type === 17));
  assert.match(JSON.stringify(p), /\d+ \/ 3000 bytes/);
  assert.equal(saveButton(p).disabled, undefined);
});

test('a draft missing required fields shows no card and Save is disabled', () => {
  const p = panelData(ID, emptyDraft('g1', '3'), ORIGIN);
  assert.ok(!p.components.some((c) => c.type === 17));
  assert.equal(saveButton(p).disabled, true);
});

test('a card over the link-preview limit warns and disables Save', () => {
  const p = panelData(ID, { ...ready(), depImage: `https://example.com/${'a'.repeat(3000)}` }, ORIGIN);
  assert.match(JSON.stringify(p), /too long/);
  assert.equal(saveButton(p).disabled, true);
});

test('the banner menu lists every banner and marks the current one', () => {
  const p = panelData(ID, { ...ready(), banner: 'detour' }, ORIGIN);
  const menu = flat(p).find((c) => c.type === 3);
  assert.deepEqual(menu.options.map((o) => o.value), BANNERS.map((b) => b.value));
  assert.deepEqual(menu.options.filter((o) => o.default).map((o) => o.value), ['detour']);
});

test('every control id is namespaced, short enough, and carries the draft id', () => {
  const ids = allIds(panelData(ID, ready(), ORIGIN));
  assert.ok(ids.length >= 5);
  for (const id of ids) {
    assert.ok(id.startsWith('le:') && id.includes(ID) && id.length <= 100, id);
  }
});

test('a status message is shown on the panel when given', () => {
  assert.match(JSON.stringify(panelData(ID, ready(), ORIGIN, 'Saved! tag text')), /Saved! tag text/);
});
