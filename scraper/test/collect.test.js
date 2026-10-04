// Zusammenführung, Ersatzquellen und Übernahme alter Daten – ohne Netzwerk.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { collect, formatProgram } from '../src/index.js';

const TODAY = '2026-10-05';

const cinemas = [
  { id: 'a', name: 'Kino A', address: 'A-Str. 1', website: 'https://a.example', kplId: '1', source: { type: 'direct' } },
  { id: 'b', name: 'Kino B', address: 'B-Str. 2', website: 'https://b.example', kplId: '2', source: { type: 'broken' } },
  { id: 'c', name: 'Kino C', address: 'C-Str. 3', website: 'https://c.example', kplId: '3', source: { type: 'kinoprogramm-leipzig' } },
];

const kplData = {
  1: { name: 'Kino A', address: '', shows: [{ date: TODAY, time: '10:00', title: 'Soll nicht genutzt werden' }] },
  2: { name: 'Kino B', address: '', shows: [{ date: TODAY, time: '18:00', title: 'Alte Liebe' }] },
  3: { name: 'Kino C', address: '', shows: [{ date: '2026-10-06', time: '20:00', title: 'Digger', version: 'OV' }] },
  9: { name: 'Sommerkino', address: 'Am See', shows: [{ date: TODAY, time: '21:00', title: 'Open Air: Grease' }] },
  10: { name: 'Vergangenes Kino', address: '', shows: [{ date: '2026-10-01', time: '21:00', title: 'Vorbei' }] },
};

const sources = {
  direct: async () => [
    { date: TODAY, time: '20:00', title: 'ALTE LIEBE' },
    { date: TODAY, time: '20:00', title: 'ALTE LIEBE' }, // doppelt
    { date: TODAY, time: '17:00', title: 'Digger (OmU)' },
    { date: '2026-10-04', time: '20:00', title: 'Gestern' },
    { date: '2026-10-13', time: '20:00', title: 'Zu weit in der Zukunft' },
  ],
  broken: async () => {
    throw new Error('HTTP 503');
  },
};

test('eigene Quelle, Ersatzquelle, kinoprogramm-leipzig.de-Kino und Zusatz-Spielorte', async () => {
  const data = await collect({
    today: TODAY,
    cinemas,
    sources,
    fetchKpl: async () => kplData,
    now: new Date('2026-10-05T16:00:00Z'),
  });

  assert.equal(data.generatedAt, '2026-10-05T16:00:00.000Z');
  assert.equal(data.days.length, 8);
  assert.equal(data.days[0], TODAY);

  const byId = Object.fromEntries(data.cinemas.map((c) => [c.id, c]));
  assert.equal(byId.a.status, 'ok');
  assert.equal(byId.a.shows, 2);
  assert.equal(byId.b.status, 'fallback');
  assert.equal(byId.b.source, 'kinoprogramm-leipzig.de');
  assert.match(byId.b.message, /HTTP 503/);
  assert.equal(byId.c.status, 'ok');
  assert.equal(byId['kpl-9'].name, 'Sommerkino');
  assert.equal(byId['kpl-10'], undefined, 'Spielorte ohne Vorstellungen im Zeitraum werden weggelassen');

  // Titel kinoübergreifend vereinheitlicht, Fassung abgetrennt
  assert.deepEqual(data.films.alteliebe, { title: 'Alte Liebe' });
  const digger = data.shows.filter((s) => s.film === 'digger');
  assert.deepEqual(
    digger.map((s) => [s.cinema, s.version]),
    [
      ['a', 'OmU'],
      ['c', 'OV'],
    ],
  );
  assert.ok(!data.shows.some((s) => s.date < TODAY || s.date > data.days.at(-1)));
  // sortiert nach Datum und Uhrzeit
  assert.deepEqual(
    data.shows.map((s) => `${s.date} ${s.time}`),
    [...data.shows.map((s) => `${s.date} ${s.time}`)].sort(),
  );
});

test('fällt alles aus, bleiben die Vorstellungen vom letzten Lauf erhalten', async () => {
  const previous = {
    films: { alteliebe: { title: 'Alte Liebe' } },
    shows: [
      { cinema: 'b', film: 'alteliebe', date: '2026-10-04', time: '20:00' },
      { cinema: 'b', film: 'alteliebe', date: TODAY, time: '20:00', version: 'OmU' },
    ],
  };
  const data = await collect({
    today: TODAY,
    cinemas: cinemas.slice(1, 2),
    sources,
    fetchKpl: async () => {
      throw new Error('offline');
    },
    previous,
  });
  assert.equal(data.cinemas[0].status, 'stale');
  assert.match(data.cinemas[0].message, /offline/);
  assert.deepEqual(data.shows, [{ cinema: 'b', film: 'alteliebe', date: TODAY, time: '20:00', version: 'OmU' }]);
});

test('ohne alte Daten wird ein Ausfall als Fehler gemeldet', async () => {
  const data = await collect({
    today: TODAY,
    cinemas: cinemas.slice(1, 2),
    sources,
    fetchKpl: async () => {
      throw new Error('offline');
    },
  });
  assert.equal(data.cinemas[0].status, 'error');
  assert.equal(data.shows.length, 0);
});

test('formatProgram erzeugt gültiges JSON mit einer Zeile pro Vorstellung', async () => {
  const data = await collect({ today: TODAY, cinemas, sources, fetchKpl: async () => kplData });
  const text = formatProgram(data);
  assert.deepEqual(JSON.parse(text), data);
  const showLines = text.split('\n').filter((l) => l.includes('"cinema":'));
  assert.equal(showLines.length, data.shows.length);
});
