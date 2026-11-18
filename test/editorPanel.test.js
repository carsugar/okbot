import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyModal, applyMenu, editModal, fieldPages, panelData } from '../src/editorPanel.js';
import { TEMPLATES } from '../src/templates/index.js';
import { parseLegStart } from '../src/legStartCard.js';
import { draftToLeg } from '../src/templates/legStart.js';

const ORIGIN = 'https://okbot.example.dev';
const ID = '1234567890123456789';
const leg = TEMPLATES.legstart;
const readyLeg = () => ({
  ...leg.initial({ leg: 3 }),
  depCity: 'Machu Picchu, Peru', depImage: 'https://example.com/dep.png',
  destCity: 'Santiago, Chile', site: 'Cajón del Maipo', airport: 'SCL Airport', money: '$15', flightTime: '3 hours',
});
const flat = (panel) => panel.components.flatMap((c) => (c.type === 1 ? c.components : [c]));
const buttons = (panel) => flat(panel).filter((c) => c.type === 2);
const saveButton = (panel) => buttons(panel).find((b) => b.custom_id.startsWith('le:save:'));

test('leg start form values rebuild the same card data the old form produced', () => {
  const old = parseLegStart({
    leg: '3', departure: 'Machu Picchu, Peru | https://example.com/dep.png',
    destination: 'Santiago, Chile | Cajón del Maipo | SCL Airport', money: '$15', flightTime: '3 hours',
  });
  assert.deepEqual(draftToLeg(readyLeg()), old);
});

test('a legacy saved leg turns back into form values', () => {
  const saved = parseLegStart({ leg: '3', departure: 'Cusco, Peru | https://x.dev/a.png', destination: 'Lima | Plaza | LIM', money: '$5', flightTime: '2 hours' });
  const d = leg.legacy.toDraft(saved);
  assert.equal(d.depCity, 'Cusco, Peru');
  assert.equal(d.depImage, 'https://x.dev/a.png');
  assert.equal(d.site, 'Plaza');
  assert.equal(d.money, '$5');
  assert.equal(d.flightTime, '2 hour');
});

test('a modal submit changes only its own page, trimmed', () => {
  const first = fieldPages(leg, readyLeg())[0].map(([k]) => k);
  const values = { [first[0]]: '  Cusco, Peru ', [first[1]]: '' };
  const next = applyModal(readyLeg(), leg, 0, (id) => values[id]);
  assert.equal(next[first[0]], 'Cusco, Peru');
  assert.equal(next[first[1]], '');
  const later = fieldPages(leg, readyLeg())[1].map(([k]) => k);
  for (const k of later) assert.equal(next[k], readyLeg()[k]);
});

test('every template pops up all its fields, five at a time, inside Discord limits', () => {
  for (const t of Object.values(TEMPLATES)) {
    const draft = { ...t.initial({ leg: 1, tag: 'x' }), transports: ['taxi', 'bus'], custom: 'tuk tuk' };
    const pages = fieldPages(t, draft);
    assert.equal(pages.flat().length, t.sections(draft).flatMap((s) => s.inputs).length, t.id);
    pages.forEach((_, i) => {
      const m = editModal(ID, t, i, draft);
      assert.equal(m.custom_id, `le_modal:${ID}:${i}`);
      assert.ok(m.title.length <= 45 && m.components.length >= 1 && m.components.length <= 5, `${t.id}/${i}`);
      for (const { components: [c] } of m.components) assert.ok(c.label.length <= 45 && (c.value ?? '').length <= c.max_length);
    });
  }
});

test('leg start and detour need two pop-ups, the simple types one', () => {
  assert.equal(fieldPages(leg, readyLeg()).length, 2);
  assert.equal(fieldPages(TEMPLATES.pitstop, TEMPLATES.pitstop.initial({ leg: 1 })).length, 1);
});

test('the pop-up is pre-filled from the draft', () => {
  const values = editModal(ID, leg, 0, readyLeg()).components.map((r) => r.components[0].value);
  assert.ok(values.includes('Santiago, Chile'));
});

test('the panel has one Edit button per pop-up and no per-section buttons', () => {
  const labels = (t, d) => flat(panelData(ID, t, d, ORIGIN)).filter((c) => c.type === 2).map((c) => c.label);
  assert.deepEqual(labels(leg, readyLeg()), ['Edit details', 'More details', 'Save and get tag']);
  assert.deepEqual(labels(TEMPLATES.pitstop, TEMPLATES.pitstop.initial({ leg: 1 })), ['Edit', 'Save and get tag']);
});

test('a ready draft shows the card, the byte count and an enabled Save button', () => {
  const p = panelData(ID, leg, readyLeg(), ORIGIN);
  assert.equal(p.flags & (1 << 15), 1 << 15);
  assert.ok(p.components.some((c) => c.type === 17));
  assert.match(JSON.stringify(p), /\d+ \/ 3000 bytes/);
  assert.equal(saveButton(p).disabled, undefined);
});

test('a draft missing required fields shows no card, the hint, and a disabled Save', () => {
  const p = panelData(ID, leg, leg.initial({ leg: 3 }), ORIGIN);
  assert.ok(!p.components.some((c) => c.type === 17));
  assert.match(JSON.stringify(p), /Fill in departure/);
  assert.equal(saveButton(p).disabled, true);
});

test('a card over the link-preview limit warns and disables Save', () => {
  const p = panelData(ID, leg, { ...readyLeg(), depImage: `https://example.com/${'a'.repeat(3000)}` }, ORIGIN);
  assert.match(JSON.stringify(p), /too long/);
  assert.equal(saveButton(p).disabled, true);
});

test('every control id is namespaced, short enough, and carries the draft id', () => {
  for (const t of Object.values(TEMPLATES)) {
    const draft = { ...t.initial({ leg: 1, tag: 'x' }), transports: ['taxi'] };
    const ids = flat(panelData(ID, t, draft, ORIGIN)).filter((c) => c.custom_id).map((c) => c.custom_id);
    assert.ok(ids.length >= 2);
    for (const id of ids) assert.ok(id.startsWith('le:') && id.includes(ID) && id.length <= 100, id);
  }
});

test('a status message is shown on the panel when given', () => {
  assert.match(JSON.stringify(panelData(ID, leg, readyLeg(), ORIGIN, 'Saved! tag text')), /Saved! tag text/);
});

test('the travel menu marks the chosen transports and a menu pick updates the draft', () => {
  const travel = TEMPLATES.travel;
  const draft = applyMenu(travel.initial({ tag: 'cdm' }), travel, 'transports', ['taxi', 'bus']);
  assert.deepEqual(draft.transports, ['taxi', 'bus']);
  const menu = flat(panelData(ID, travel, draft, ORIGIN)).find((c) => c.type === 3);
  assert.deepEqual(menu.options.filter((o) => o.default).map((o) => o.value), ['taxi', 'bus']);
  assert.equal(menu.min_values, 0);
});

test('the travel costs section appears once transports are chosen, one input each', () => {
  const travel = TEMPLATES.travel;
  assert.equal(travel.sections(travel.initial({ tag: 'x' })).length, 1);
  const withCosts = travel.sections({ ...travel.initial({ tag: 'x' }), transports: ['taxi', 'bus'], custom: 'tuk tuk' });
  assert.deepEqual(withCosts[1].inputs.map((i) => i[0]), ['t_taxi', 't_bus', 't_tuk tuk']);
});
