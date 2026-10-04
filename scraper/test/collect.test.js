// Zusammenführung und Übernahme alter Daten – ohne Netzwerk.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { collect, formatProgram } from '../src/index.js';

const TODAY = '2026-10-05';

const cinemas = [
  { id: 'a', name: 'Kino A', address: 'A-Str. 1', website: 'https://a.example', source: { type: 'direct' } },
  { id: 'b', name: 'Kino B', address: 'B-Str. 2', website: 'https://b.example', source: { type: 'broken' } },
  { id: 'c', name: 'Kino C', address: 'C-Str. 3', website: 'https://c.example', source: { type: 'other' } },
];

const sources = {
  direct: async () => [
    { date: TODAY, time: '20:00', title: 'ALTE LIEBE', url: 'javascript:alert(1)' },
    { date: TODAY, time: '20:00', title: 'ALTE LIEBE' }, // doppelt
    { date: TODAY, time: '17:00', title: 'Digger (OmU)', url: 'https://a.example/digger' },
    { date: '2026-10-04', time: '20:00', title: 'Gestern' },
    { date: '2026-10-13', time: '20:00', title: 'Zu weit in der Zukunft' },
  ],
  other: async () => [
    { date: '2026-10-06', time: '20:00', title: 'Alte Liebe' },
    { date: '2026-10-06', time: '18:00', title: 'Digger', version: 'OV' },
  ],
  broken: async () => {
    throw new Error('HTTP 503');
  },
};

test('Vorstellungen werden gefiltert, vereinheitlicht und sortiert', async () => {
  const data = await collect({ today: TODAY, cinemas, sources, now: new Date('2026-10-05T16:00:00Z') });

  assert.equal(data.generatedAt, '2026-10-05T16:00:00.000Z');
  assert.equal(data.days.length, 8);
  assert.equal(data.days[0], TODAY);

  const byId = Object.fromEntries(data.cinemas.map((c) => [c.id, c]));
  assert.equal(byId.a.status, 'ok');
  assert.equal(byId.a.shows, 2);
  assert.equal(byId.b.status, 'error');
  assert.match(byId.b.message, /HTTP 503/);
  assert.equal(byId.c.status, 'ok');

  // Titel kinoübergreifend vereinheitlicht, Fassung abgetrennt
  assert.deepEqual(data.films.alteliebe, { title: 'Alte Liebe' });
  assert.deepEqual(
    data.shows.filter((s) => s.film === 'digger').map((s) => [s.cinema, s.version, s.url]),
    [
      ['a', 'OmU', 'https://a.example/digger'],
      ['c', 'OV', undefined],
    ],
  );
  // Nur http(s)-Links
  assert.equal(data.shows.find((s) => s.cinema === 'a' && s.film === 'alteliebe').url, undefined);
  assert.ok(!data.shows.some((s) => s.date < TODAY || s.date > data.days.at(-1)));
  const order = data.shows.map((s) => `${s.date} ${s.time}`);
  assert.deepEqual(order, [...order].sort());
});

test('fällt eine Quelle aus, bleiben die Vorstellungen vom letzten Lauf erhalten', async () => {
  const previous = {
    films: { alteliebe: { title: 'Alte Liebe' } },
    shows: [
      { cinema: 'b', film: 'alteliebe', date: '2026-10-04', time: '20:00' },
      { cinema: 'b', film: 'alteliebe', date: TODAY, time: '20:00', version: 'OmU' },
      { cinema: 'a', film: 'alteliebe', date: TODAY, time: '22:00' },
    ],
  };
  const data = await collect({ today: TODAY, cinemas: cinemas.slice(1, 2), sources, previous });
  assert.equal(data.cinemas[0].status, 'stale');
  assert.match(data.cinemas[0].message, /HTTP 503/);
  assert.deepEqual(data.shows, [{ cinema: 'b', film: 'alteliebe', date: TODAY, time: '20:00', version: 'OmU' }]);
});

test('formatProgram erzeugt gültiges JSON mit einer Zeile pro Vorstellung', async () => {
  const data = await collect({ today: TODAY, cinemas, sources });
  const text = formatProgram(data);
  assert.deepEqual(JSON.parse(text), data);
  const showLines = text.split('\n').filter((l) => l.includes('"cinema":'));
  assert.equal(showLines.length, data.shows.length);
});
