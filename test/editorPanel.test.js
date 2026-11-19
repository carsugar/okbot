import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyModal, editModal, modalPages, panelData } from '../src/editorPanel.js';
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
const pagesOf = (t, d) => modalPages(t, d).map((p) => p.inputs);
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
  const first = pagesOf(leg, readyLeg())[0].map(([k]) => k);
  const values = { [first[0]]: '  Cusco, Peru ', [first[1]]: '' };
  const next = applyModal(readyLeg(), leg, 0, (id) => values[id]);
  assert.equal(next[first[0]], 'Cusco, Peru');
  assert.equal(next[first[1]], '');
  const later = pagesOf(leg, readyLeg())[1].map(([k]) => k);
  for (const k of later) assert.equal(next[k], readyLeg()[k]);
});

test('every template pops up all its fields, five at a time, inside Discord limits', () => {
  for (const t of Object.values(TEMPLATES)) {
    const draft = { ...t.initial({ leg: 1, tag: 'x' }), transports: ['taxi', 'bus', 'custom'], custom: 'tuk tuk' };
    const pages = modalPages(t, draft);
    assert.equal(pages.flatMap((p) => p.inputs).length, t.sections(draft).flatMap((s) => s.inputs).length, t.id);
    pages.forEach((_, i) => {
      const m = editModal(ID, t, i, draft);
      assert.equal(m.custom_id, `le_modal:${ID}:${i}`);
      assert.ok(m.title.length <= 45 && m.components.length >= 1 && m.components.length <= 5, `${t.id}/${i}`);
      for (const { label, component: c } of m.components) assert.ok(label.length <= 45 && (c.value ?? '').length <= (c.max_length ?? 100));
    });
  }
});

test('leg start and detour need two pop-ups, the simple types one', () => {
  assert.equal(modalPages(leg, readyLeg()).length, 2);
  assert.equal(modalPages(TEMPLATES.pitstop, TEMPLATES.pitstop.initial({ leg: 1 })).length, 1);
});

test('the pop-up is pre-filled from the draft', () => {
  const values = editModal(ID, leg, 0, readyLeg()).components.map((r) => r.component.value);
  assert.ok(values.includes('Santiago, Chile'));
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

test('travel has tick boxes for the ways to get there inside its first pop-up, after tag, destination and extra', () => {
  const travel = TEMPLATES.travel;
  const d = { ...travel.initial({ tag: 'cdm' }), transports: ['taxi', 'bus'] };
  const m = editModal(ID, travel, 0, d);
  assert.deepEqual(m.components.map((c) => c.component.custom_id), ['tagName', 'dest', 'extra', 'transports', 'custom']);
  const boxes = m.components[3].component;
  assert.equal(boxes.type, 22);
  assert.deepEqual(boxes.options.map((o) => o.value), ['taxi', 'bus', 'walking', 'custom']);
  assert.deepEqual(boxes.options.filter((o) => o.default).map((o) => o.value), ['taxi', 'bus']);
  assert.equal(boxes.min_values, 0);
  assert.equal(boxes.required, false);
  assert.ok(m.components.length <= 5);
});

test('ticking boxes and submitting the first travel pop-up sets the transports', () => {
  const travel = TEMPLATES.travel;
  const vals = { tagName: 'cdm', dest: 'Plaza', extra: '', custom: '', transports: ['bus', 'walking'] };
  const next = applyModal(travel.initial({}), travel, 0, (k) => vals[k]);
  assert.deepEqual(next.transports, ['bus', 'walking']);
  assert.equal(next.tagName, 'cdm');
});

test('the times and costs come on later pop-ups: a time box and a cost box per transport, two transports to a pop-up', () => {
  const travel = TEMPLATES.travel;
  assert.equal(modalPages(travel, travel.initial({ tag: 'x' })).length, 1);
  const three = { ...travel.initial({ tag: 'x' }), transports: ['taxi', 'bus', 'walking'] };
  assert.deepEqual(pagesOf(travel, three).slice(1).map((p) => p.map((i) => i[0])), [['t_taxi', 'c_taxi', 't_bus', 'c_bus'], ['t_walking', 'c_walking']]);
  const custom = { ...travel.initial({ tag: 'x' }), transports: ['taxi', 'custom'], custom: 'tuk tuk' };
  assert.deepEqual(pagesOf(travel, custom)[1].map((i) => i[0]), ['t_taxi', 'c_taxi', 't_tuk tuk', 'c_tuk tuk']);
});

test('leg-based cards ask for the leg number in the pop-up and are not ready without a number', () => {
  for (const id of ['legstart', 'roadblock', 'detour', 'pitstop']) {
    const t = TEMPLATES[id];
    const d = t.initial({});
    assert.equal(d.leg, '', id);
    assert.equal(t.draftKey(d), null, id);
    assert.equal(pagesOf(t, d)[0][0][0], 'leg', id);
    assert.equal(t.ready({ ...d, leg: 'x' }), false, id);
    assert.equal(t.draftKey({ ...d, leg: '4' }) !== null, true, id);
  }
});

test('tag-based cards have no draft key until they have a tag name', () => {
  assert.equal(TEMPLATES.task.draftKey(TEMPLATES.task.initial({})), null);
  assert.ok(TEMPLATES.task.draftKey({ tagName: 'abc' }));
});

test('the pop-up always has the leg number field, so it can be changed later', () => {
  const t = TEMPLATES.pitstop;
  assert.equal(pagesOf(t, t.initial({}))[0][0][0], 'leg');
  assert.equal(pagesOf(t, t.initial({ leg: 3 }))[0][0][0], 'leg');
});

test('the first button says Fill in details until something has been entered, then Edit', () => {
  const labels = (t, d) => buttons(panelData(ID, t, d, ORIGIN)).map((b) => b.label);
  const t = TEMPLATES.pitstop;
  assert.deepEqual(labels(t, t.initial({ leg: 1 })), ['Fill in details', 'Save and get tag to copy']);
  assert.deepEqual(labels(t, { ...t.initial({ leg: 1 }), touched: true }), ['Edit', 'Save and get tag to copy']);
  assert.deepEqual(labels(leg, readyLeg()), ['Fill in details', 'More details', 'Save and get tag to copy']);
  assert.deepEqual(labels(leg, { ...readyLeg(), touched: true }), ['Edit details', 'More details', 'Save and get tag to copy']);
});

test('travel with a destination and transports needs the times and costs: highlighted button, message, Save waits', () => {
  const t = TEMPLATES.travel;
  const base = { ...t.initial({ tag: 'cdm' }), dest: 'Plaza', transports: ['taxi', 'bus'], touched: true };
  const p = panelData(ID, t, base, ORIGIN);
  const costs = buttons(p).find((b) => b.label === 'Times and costs');
  assert.equal(costs.style, 1);
  assert.match(JSON.stringify(p), /Next step:\*\* press \*\*Times and costs\*\*.*taxi or bus/);
  assert.equal(saveButton(p).disabled, true);
  const done = panelData(ID, t, { ...base, t_taxi: '30 min', c_taxi: '$20', t_bus: '1 hour', c_bus: '$5' }, ORIGIN);
  assert.equal(buttons(done).find((b) => b.label === 'Times and costs').style, 2);
  assert.equal(saveButton(done).disabled, undefined);
  assert.equal(saveButton(panelData(ID, t, { ...base, dest: '' }, ORIGIN)).disabled, undefined);
});

test('every text box has a hint saying what to write there, short enough for Discord', () => {
  for (const t of Object.values(TEMPLATES)) {
    const draft = { ...t.initial({ leg: 1, tag: 'x' }), transports: ['taxi', 'bus', 'custom'], custom: 'tuk tuk' };
    modalPages(t, draft).forEach((_, i) => {
      for (const { component: c } of editModal(ID, t, i, draft).components) {
        if (c.type !== 4) continue;
        assert.ok(c.placeholder && c.placeholder.length <= 100, `${t.id}/${c.custom_id}`);
      }
    });
  }
});
