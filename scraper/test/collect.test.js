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

test('Filmlänge gilt kinoübergreifend – die häufigste Angabe gewinnt', async () => {
  const data = await collect({
    today: TODAY,
    cinemas: [cinemas[0], cinemas[2], { ...cinemas[1], source: { type: 'third' } }],
    sources: {
      direct: async () => [
        { date: TODAY, time: '17:00', title: 'Digger', duration: 129 },
        { date: TODAY, time: '20:00', title: 'Vaterland' }, // Länge hier unbekannt
      ],
      other: async () => [
        { date: TODAY, time: '18:00', title: 'DIGGER', duration: 130 },
        { date: TODAY, time: '19:00', title: 'Vaterland', duration: 82 },
      ],
      third: async () => [
        { date: TODAY, time: '21:00', title: 'Digger', duration: 129 },
        { date: TODAY, time: '22:00', title: 'Kurz', duration: 3 }, // unplausibel → ignoriert
      ],
    },
  });
  assert.equal(data.films.digger.duration, 129);
  assert.equal(data.films.vaterland.duration, 82);
  assert.equal(data.films.kurz.duration, undefined);
});

test('findet eine Quelle plötzlich nichts mehr, gilt das als Fehler und die alten Daten bleiben', async () => {
  const previous = {
    films: { alteliebe: { title: 'Alte Liebe', duration: 112 } },
    shows: [{ cinema: 'a', film: 'alteliebe', date: TODAY, time: '20:00' }],
  };
  const empty = { direct: async () => [] };
  const data = await collect({ today: TODAY, cinemas: cinemas.slice(0, 1), sources: empty, previous });
  assert.equal(data.cinemas[0].status, 'stale');
  assert.match(data.cinemas[0].message, /Keine Vorstellungen gefunden/);
  assert.deepEqual(data.shows, [{ cinema: 'a', film: 'alteliebe', date: TODAY, time: '20:00' }]);
  assert.equal(data.films.alteliebe.duration, 112);

  // Ohne angekündigte Vorstellungen (z. B. Sommerpause) ist "nichts gefunden" in Ordnung
  const quiet = await collect({ today: TODAY, cinemas: cinemas.slice(0, 1), sources: empty, previous: { films: {}, shows: [] } });
  assert.equal(quiet.cinemas[0].status, 'ok');
  assert.equal(quiet.shows.length, 0);
});

test('Sonderveranstaltungen landen beim selben Film und behalten ihr Etikett', async () => {
  const previous = { films: {}, shows: [] };
  const data = await collect({
    today: TODAY,
    cinemas: cinemas.slice(0, 1).concat(cinemas[2]),
    sources: {
      direct: async () => [
        { date: TODAY, time: '18:00', title: 'Premiere: ALTE LIEBE (OmU)' },
        { date: TODAY, time: '20:00', title: 'Pans Labyrinth - Best of Cinema' },
      ],
      other: async () => [
        { date: TODAY, time: '17:00', title: 'Alte Liebe' },
        { date: TODAY, time: '21:00', title: "Pan's Labyrinth" },
        { date: TODAY, time: '19:00', title: 'DER SPAZIERGANG NACH SYRAKUS' },
        { date: TODAY, time: '22:00', title: 'Spaziergang nach Syrakus' },
      ],
    },
    previous,
  });
  assert.deepEqual(Object.keys(data.films).sort(), ['alteliebe', 'panslabyrinth', 'spaziergangnachsyrakus']);
  assert.equal(data.films.spaziergangnachsyrakus.title, 'Spaziergang nach Syrakus');
  assert.equal(data.films.alteliebe.title, 'Alte Liebe');
  const premiere = data.shows.find((s) => s.film === 'alteliebe' && s.cinema === 'a');
  assert.deepEqual([premiere.label, premiere.version], ['Premiere', 'OmU']);
  assert.equal(data.shows.find((s) => s.film === 'panslabyrinth' && s.cinema === 'a').label, 'Best of Cinema');

  // Etikett überlebt die Übernahme aus dem Vortag
  const again = await collect({
    today: TODAY,
    cinemas: cinemas.slice(0, 1),
    sources: { direct: async () => [] },
    previous: data,
  });
  assert.equal(again.cinemas[0].status, 'stale');
  assert.equal(again.shows.find((s) => s.film === 'alteliebe').label, 'Premiere');
});

test('Titel nur in Versalien werden mit Hilfe der Beschreibungen normal geschrieben', async () => {
  const data = await collect({
    today: TODAY,
    cinemas: cinemas.slice(0, 1),
    sources: {
      direct: async () => [
        { date: TODAY, time: '18:00', title: 'WAS HABEN WIR GELACHT', description: 'Fünf Frauen erzählen, worüber wir damals gelacht haben.' },
        { date: TODAY, time: '20:00', title: 'THE INVITE (OmU)' },
      ],
    },
  });
  assert.deepEqual(
    Object.values(data.films).map((f) => f.title),
    ['The Invite', 'Was haben wir gelacht'],
  );
});

test('formatProgram erzeugt gültiges JSON mit einer Zeile pro Vorstellung', async () => {
  const data = await collect({ today: TODAY, cinemas, sources });
  const text = formatProgram(data);
  assert.deepEqual(JSON.parse(text), data);
  const showLines = text.split('\n').filter((l) => l.includes('"cinema":'));
  assert.equal(showLines.length, data.shows.length);
});
