// Die Hamburger Seite muss der Leipziger Vorlage entsprechen – sonst `node src/sites.js` ausführen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { CITIES } from '../src/cities/index.js';
import { SITE_TEXTS, renderSite } from '../src/sites.js';

test('Seiten der Städte sind aus der Vorlage public/ erzeugt', async () => {
  for (const cityId of Object.keys(SITE_TEXTS)) {
    const files = await renderSite(cityId);
    assert.ok(files.has('index.html'));
    for (const [path, content] of files) {
      const onDisk = await readFile(join(CITIES[cityId].siteDir, path)).catch(() => null);
      assert.ok(onDisk?.equals(content), `${cityId}/${path} veraltet – bitte "node src/sites.js" ausführen`);
    }
  }
});

test('Hamburger Seite heißt Hamburg', async () => {
  const html = (await renderSite('hamburg')).get('index.html').toString('utf8');
  assert.match(html, /<title>Kinoprogramm Hamburg<\/title>/);
  assert.doesNotMatch(html, /Leipzig/);
});
