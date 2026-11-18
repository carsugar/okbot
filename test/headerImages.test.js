import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statSync } from 'node:fs';

// Discord must fetch every image in a card within 10 seconds, so keep them small.
for (const name of ['route-info', 'detour', 'roadblock']) {
  test(`hosted ${name} header image exists and is under 400 KB`, () => {
    const { size } = statSync(new URL(`../public/img/${name}.webp`, import.meta.url));
    assert.ok(size > 1000 && size < 400 * 1024, `size ${size}`);
  });
}
