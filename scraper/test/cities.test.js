// Prüft die Kinolisten der Städte auf Tippfehler – ohne Netzwerk.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CITIES } from '../src/cities/index.js';
import { SOURCES } from '../src/index.js';

test('Jede Stadt hat vollständige Kinoeinträge mit bekannten Quellen', () => {
  for (const [cityId, city] of Object.entries(CITIES)) {
    assert.ok(city.cinemas.length > 0, cityId);
    const ids = new Set();
    for (const cinema of city.cinemas) {
      const where = `${cityId}/${cinema.id}`;
      assert.match(cinema.id, /^[a-z0-9-]+$/, where);
      assert.ok(!ids.has(cinema.id), `${where} doppelt`);
      ids.add(cinema.id);
      for (const field of ['name', 'address', 'website']) assert.ok(cinema[field], `${where}: ${field} fehlt`);
      assert.match(cinema.website, /^https:\/\//, `${where}: website`);
      for (const source of [cinema.source, cinema.source.supplement].filter(Boolean)) {
        assert.ok(SOURCES[source.type], `${where}: unbekannte Quelle ${source.type}`);
        const needs = { kinoheld: 'cinemaId', cinetixx: 'cinemaId', cinestar: 'cinemaId', kinozeit: 'url', ical: 'url', cineprog: 'url' };
        if (needs[source.type]) assert.ok(source[needs[source.type]], `${where}: ${needs[source.type]} fehlt`);
      }
    }
  }
});

test('Hamburg enthält das Beluga Kino in Quickborn', () => {
  const beluga = CITIES.hamburg.cinemas.find((c) => c.id === 'beluga');
  assert.ok(beluga);
  assert.match(beluga.address, /Quickborn/);
});
