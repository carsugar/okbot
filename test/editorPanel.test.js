import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyModal, editModal, modalPages, panelData, copyMessages, deleteConfirm } from '../src/editorPanel.js';
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
  transports: ['taxi'], t_taxi: '40 min, $20',
});
const flat = (panel) => panel.components.flatMap((c) => (c.type === 1 ? c.components : c.type === 9 ? [c.accessory] : [c]));
const buttons = (panel) => flat(panel).filter((c) => c.type === 2);
const plain = (p) => p.components.flatMap((c) => (c.type === 9 ? c.components : [c])).filter((c) => c.type === 10).map((c) => c.content).join('\n');
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

test('leg start has five pop-ups (four until a way to get there is ticked), detour three, the simple types one', () => {
  assert.equal(modalPages(leg, readyLeg()).length, 5);
  assert.equal(modalPages(leg, { ...readyLeg(), transports: [] }).length, 4);
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
  assert.match(JSON.stringify(p), /Fill in the steps below/);
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

test('travel has tick boxes for the ways to get there inside its first pop-up, after tag, leg and destination', () => {
  const travel = TEMPLATES.travel;
  const d = { ...travel.initial({ tag: 'cdm' }), transports: ['taxi', 'bus'] };
  const m = editModal(ID, travel, 0, d);
  assert.deepEqual(m.components.map((c) => c.component.custom_id), ['tagName', 'leg', 'dest', 'transports', 'custom']);
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

test('all the times and costs share one pop-up, one box per transport and one for the custom emoji', () => {
  const travel = TEMPLATES.travel;
  assert.equal(modalPages(travel, travel.initial({ tag: 'x' })).length, 2);
  const all = { ...travel.initial({ tag: 'x' }), transports: ['taxi', 'bus', 'walking', 'custom'], custom: 'tuk tuk' };
  assert.equal(modalPages(travel, all).length, 3);
  assert.deepEqual(pagesOf(travel, all)[1].map((i) => i[0]), ['t_taxi', 't_bus', 't_walking', 't_tuk tuk', 'customEmoji']);
  const two = { ...travel.initial({ tag: 'x' }), transports: ['taxi', 'bus'] };
  assert.deepEqual(pagesOf(travel, two)[1].map((i) => i[0]), ['t_taxi', 't_bus', 'extra']);
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

test('each step has one button: Fill in until it is done, then Edit, Customize for optional steps; Save is last', () => {
  const labels = (t, d) => buttons(panelData(ID, t, d, ORIGIN)).map((b) => b.label);
  const t = TEMPLATES.pitstop;
  assert.deepEqual(labels(t, t.initial({ leg: 1 })), ['Fill in', 'Save']);
  assert.deepEqual(labels(t, { ...t.initial({ leg: 1 }), location: 'Plaza', touched: true }), ['Edit', 'Save']);
  assert.deepEqual(labels(leg, readyLeg()), ['Edit', 'Edit', 'Edit', 'Edit', 'Customize', 'Save']);
});

test('travel with a destination and transports needs the times and costs: highlighted button, message, Save waits', () => {
  const t = TEMPLATES.travel;
  const base = { ...t.initial({ tag: 'cdm' }), dest: 'Plaza', transports: ['taxi', 'bus'], touched: true };
  const p = panelData(ID, t, base, ORIGIN);
  const edit = (panel, i) => buttons(panel).find((b) => b.custom_id.endsWith(`:${i}`));
  assert.equal(edit(p, 1).style, 1);
  assert.match(plain(p), /2\. Times and costs/);
  assert.equal(saveButton(p).disabled, true);
  const done = panelData(ID, t, { ...base, t_taxi: '30 min', c_taxi: '$20', t_bus: '1 hour', c_bus: '$5' }, ORIGIN);
  assert.equal(edit(done, 1).style, 2);
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

test('detour is guided: details, then a pop-up per option with five boxes, a checklist and a next step', () => {
  const t = TEMPLATES.detour;
  const blank = { ...t.initial({ leg: 4 }), touched: true };
  assert.deepEqual(pagesOf(t, blank).map((p) => p.map((i) => i[0])), [
    ['leg', 'tagName', 'image', 'switchTime'],
    ['name1', 'time1', 'loc1', 'img1', 'desc1'],
    ['name2', 'time2', 'loc2', 'img2', 'desc2'],
  ]);

  const text = (d) => plain(panelData(ID, t, d, ORIGIN));
  const edit = (d, i) => buttons(panelData(ID, t, d, ORIGIN)).find((b) => b.custom_id.endsWith(`:${i}`));
  assert.match(text(blank), /👉 \*\*1\. Details\*\*[^]*⬜ \*\*2\. Option 1\*\*[^]*⬜ \*\*3\. Option 2\*\*[^]*⬜ \*\*4\. Save\*\*/);
  assert.match(text(blank), /Go down the list\.\*\* Press the blue button/);
  assert.equal(edit(blank, 0).style, 1);

  const withLocation = { ...blank, tagName: 'sj-detour' };
  assert.match(text(withLocation), /✅ \*\*1\. Details\*\*[^]*👉 \*\*2\. Option 1\*\*[^]*⬜ \*\*3\. Option 2\*\*/);
  assert.equal(edit(withLocation, 1).style, 1);
  assert.equal(edit(withLocation, 2).style, 2);
  assert.equal(saveButton(panelData(ID, t, withLocation, ORIGIN)).disabled, true);

  const one = { ...withLocation, name1: 'Mangled', time1: '5 minutes', loc1: 'Plaza', desc1: 'where they do it.' };
  assert.match(text(one), /✅ \*\*2\. Option 1\*\*[^]*👉 \*\*3\. Option 2\*\*/);
  assert.equal(edit(one, 2).style, 1);

  const done = { ...one, name2: 'Tangled', time2: '6 minutes', loc2: 'Park', desc2: 'where they do that.' };
  assert.match(text(done), /All set\.\*\* Press \*\*Save\*\*/);
  assert.deepEqual(buttons(panelData(ID, t, done, ORIGIN)).map((b) => b.label), ['Edit', 'Edit', 'Edit', 'Save']);
  assert.equal(saveButton(panelData(ID, t, done, ORIGIN)).disabled, undefined);
});

test('the leg start flight text shows the usual paragraph as a default, and an unchanged default is not saved as an override', () => {
  const d = { ...readyLeg(), flightText: '' };
  const page = pagesOf(leg, d).findIndex((p) => p.some((i) => i[0] === 'flightText'));
  const value = () => editModal(ID, leg, page, d).components.map((c) => c.component).find((c) => c.custom_id === 'flightText').value;
  assert.match(value(), /^All teams will be put onto the same, equalizing \*\*.+\*\* to .+\./);
  const unchanged = applyModal(d, leg, page, (k) => (k === 'flightText' ? value() : d[k]));
  assert.equal(unchanged.flightText, '');
  const changed = applyModal(d, leg, page, (k) => (k === 'flightText' ? 'Teams fly separately this leg.' : d[k]));
  assert.equal(changed.flightText, 'Teams fly separately this leg.');
});

test('no flight text default until the flight and destination are filled in', () => {
  const box = editModal(ID, leg, pagesOf(leg, leg.initial({})).findIndex((p) => p.some((i) => i[0] === 'flightText')), leg.initial({})).components.map((c) => c.component).find((c) => c.custom_id === 'flightText');
  assert.equal(box.value, undefined);
});

test('leg start: departure and destination, airport and flight, then site and ways to get there, times, optional text', () => {
  const blank = { ...leg.initial({ leg: 2 }), touched: true };
  assert.deepEqual(pagesOf(leg, blank).map((p) => p.map((i) => i[0])), [
    ['leg', 'depCity', 'depImage', 'destCity'], ['airport', 'airportImage', 'money', 'flightTime'], ['site', 'custom', 'extra'], ['flightText'],
  ]);
  const text = (d) => plain(panelData(ID, leg, d, ORIGIN));
  assert.match(text(blank), /👉 \*\*1\. Departure & destination\*\*[^]*⬜ \*\*2\. Airport, money & flight\*\*[^]*⬜ \*\*3\. Site & ways to get there\*\*[^]*➖ \*\*4\. Customize text\*\* \(optional\)[^]*⬜ \*\*5\. Save\*\*/);
  assert.match(text(blank), /usual flight text shows here once/);

  const dep = { ...blank, depCity: 'Salzburg, Austria', destCity: 'Vienna, Austria' };
  assert.match(text(dep), /✅ \*\*1\. Departure[^]*👉 \*\*2\. Airport, money & flight/);

  const flight = { ...dep, airport: 'SZG Airport', flightTime: '2 hour 35 min' };
  assert.match(text(flight), /👉 \*\*3\. Site/);

  const dest = { ...flight, site: 'Mirabell Gardens', transports: ['taxi'] };
  assert.match(text(dest), /👉 \*\*4\. Times and costs/);
  assert.match(text(dest), /Usual text: All teams will be put onto the same, equalizing \*\*2 hour 35 min flight\*\* to Austria\. Once there, make your way to \*\*Mirabell Gardens\*\*/);
  assert.equal(saveButton(panelData(ID, leg, dest, ORIGIN)).disabled, true);

  const done = { ...dest, t_taxi: '10 min, $5' };
  assert.match(text(done), /All set\.\*\* Press \*\*Save\*\*/);
  assert.equal(saveButton(panelData(ID, leg, done, ORIGIN)).disabled, undefined);

  const custom = { ...done, flightText: 'Teams fly separately.' };
  assert.match(text(custom), /Using your own wording/);
  assert.match(text(custom), /✅ \*\*5\. Customize text/);
});

test('the leg start customize pop-up opens showing the usual text', () => {
  const d = { ...readyLeg(), flightText: '' };
  const box = editModal(ID, leg, 4, d).components.map((c) => c.component)[0];
  assert.equal(box.custom_id, 'flightText');
  assert.match(box.value, /^All teams will be put onto the same, equalizing/);
});

test('every clue type lists numbered steps, each with its own button, ending with Save', () => {
  for (const t of Object.values(TEMPLATES)) {
    const d = { ...t.initial({ leg: 1, tag: 'x' }), transports: ['taxi'], dest: 'P' };
    const p = panelData(ID, t, d, ORIGIN);
    const rows = p.components.filter((c) => c.type === 9);
    assert.ok(rows.length >= 2, t.id);
    rows.forEach((r, i) => assert.match(r.components[0].content, new RegExp(`\\*\\*${i + 1}\\. `), `${t.id} ${i}`));
    assert.match(rows.at(-1).components[0].content, /\*\*\d+\. Save\*\*/, t.id);
    assert.equal(rows.at(-1).accessory.custom_id.startsWith('le:save:'), true, t.id);
  }
});

test('a single-pop-up clue lists its fill-in step first and saving last', () => {
  const t = TEMPLATES.pitstop;
  const blank = plain(panelData(ID, t, t.initial({ leg: 3 }), ORIGIN));
  assert.match(blank, /👉 \*\*1\. Details\*\*[^]*⬜ \*\*2\. Save/);
  const done = plain(panelData(ID, t, { ...t.initial({ leg: 3 }), location: 'Plaza', touched: true }, ORIGIN));
  assert.match(done, /✅ \*\*1\. Details\*\*[^]*👉 \*\*2\. Save/);
});

test('what a save leaves to copy is the very last thing on the panel, below the buttons', () => {
  const t = TEMPLATES.pitstop;
  const d = { ...t.initial({ leg: 3 }), location: 'Plaza', touched: true };
  const p = panelData(ID, t, d, ORIGIN, '', '**Saved, but nothing has been posted.** copy the tag');
  assert.equal(p.components.at(-1).content, '**Saved, but nothing has been posted.** copy the tag');
  assert.equal(p.components.at(-2).type, 9);
  assert.ok(!plain(panelData(ID, t, d, ORIGIN)).includes('Saved, but'));
});

test('the guidance on changing the flight text is in the Customize text pop-up, not on the panel', () => {
  const d = { ...readyLeg(), flightText: '' };
  const label = editModal(ID, leg, 4, d).components[0];
  assert.match(label.description, /Clear the box to go back to the usual text/);
  assert.ok(label.description.length <= 100);
  const panelText = plain(panelData(ID, leg, d, ORIGIN)) + plain(panelData(ID, leg, { ...d, flightText: 'Mine' }, ORIGIN));
  assert.doesNotMatch(panelText, /Press \*\*Customize text|Clear the box|clear the box/);
});

test('the detour boxes explain how their text is used', () => {
  const d = TEMPLATES.detour.initial({ leg: 1 });
  const boxes = editModal(ID, TEMPLATES.detour, 1, d).components;
  const byKey = Object.fromEntries(boxes.map((b) => [b.component.custom_id, b]));
  assert.match(byKey.desc1.description, /Start with "where"/);
  assert.match(byKey.img1.description, /links to this picture/);
  for (const b of boxes) assert.ok((b.description ?? '').length <= 100);
});

test('the tags to copy go in one message when they fit, and a few when they do not', () => {
  const one = copyMessages(['**A**\n```\na\n```', '**B**\n```\nb\n```']);
  assert.equal(one.length, 1);
  assert.equal(one[0].flags, (1 << 15) | 64);
  assert.deepEqual(one[0].components.map((c) => c.type), [10, 10]);
  const long = 'x'.repeat(1500);
  const several = copyMessages([long, long, long]);
  assert.deepEqual(several.map((m) => m.components.length), [2, 1]);
  assert.deepEqual(copyMessages([]), []);
});

test('only a clue opened from /edit_clue has a Delete button, and it asks first', () => {
  assert.doesNotMatch(JSON.stringify(panelData(ID, leg, readyLeg(), ORIGIN)), /le:delete:/);
  assert.match(JSON.stringify(panelData(ID, leg, { ...readyLeg(), savedKey: 'g:leg:l3' }, ORIGIN)), /le:delete:/);
  const ask = JSON.stringify(deleteConfirm(ID, 'Leg 3'));
  assert.match(ask, /le:confirmdelete:/);
  assert.match(ask, /le:cancel:/);
});
