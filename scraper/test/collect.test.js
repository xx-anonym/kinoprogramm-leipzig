// Zusammenführung und Übernahme alter Daten – ohne Netzwerk.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { collect, formatProgram, mergeByDay, shouldAlert } from '../src/index.js';

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
  const noon = new Date(`${TODAY}T10:00:00Z`); // 12:00 Uhr in Leipzig
  const data = await collect({ today: TODAY, cinemas: cinemas.slice(0, 1), sources: empty, previous, now: noon });
  assert.equal(data.cinemas[0].status, 'stale');
  assert.match(data.cinemas[0].message, /Keine Vorstellungen gefunden/);
  assert.deepEqual(data.shows, [{ cinema: 'a', film: 'alteliebe', date: TODAY, time: '20:00' }]);
  assert.equal(data.films.alteliebe.duration, 112);

  // Ohne angekündigte Vorstellungen (z. B. Sommerpause) ist "nichts gefunden" in Ordnung
  const quiet = await collect({ today: TODAY, cinemas: cinemas.slice(0, 1), sources: empty, previous: { films: {}, shows: [] }, now: noon });
  assert.equal(quiet.cinemas[0].status, 'ok');
  assert.equal(quiet.shows.length, 0);

  // Abends nach der letzten Vorstellung des Tages liefern manche Quellen nichts mehr – das ist kein Fehler
  const late = new Date(`${TODAY}T19:30:00Z`); // 21:30 Uhr in Leipzig
  const evening = await collect({ today: TODAY, cinemas: cinemas.slice(0, 1), sources: empty, previous, now: late });
  assert.equal(evening.cinemas[0].status, 'ok');
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
    now: new Date(`${TODAY}T10:00:00Z`),
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

test('Mail erst, wenn ein Problem auch im nächsten Lauf noch besteht – und nicht jede Stunde', async () => {
  const broken = {
    broken: async () => {
      throw new Error('fetch failed', { cause: { code: 'ETIMEDOUT' } });
    },
  };
  const hour = 36e5;
  const run = (previous, now) => collect({ today: TODAY, cinemas: cinemas.slice(1, 2), sources: broken, previous, now });
  const problems = (data) => data.cinemas.filter((c) => c.status !== 'ok');

  const t0 = new Date(`${TODAY}T08:23:00Z`); // 10:23 Uhr in Leipzig
  const before = {
    generatedAt: new Date(t0 - hour).toISOString(),
    cinemas: [{ id: 'b', status: 'ok' }],
    films: { alteliebe: { title: 'Alte Liebe' } },
    shows: [{ cinema: 'b', film: 'alteliebe', date: TODAY, time: '20:00' }],
  };

  const first = await run(before, t0);
  assert.equal(first.cinemas[0].status, 'stale');
  assert.equal(first.cinemas[0].message, 'fetch failed (ETIMEDOUT)');
  assert.equal(first.cinemas[0].since, t0.toISOString());
  assert.equal(shouldAlert(problems(first), before.generatedAt, t0), false, 'einzelner Aussetzer');

  const t1 = new Date(t0.getTime() + hour);
  const second = await run(first, t1);
  assert.equal(second.cinemas[0].since, t0.toISOString(), 'Beginn des Problems bleibt erhalten');
  assert.equal(shouldAlert(problems(second), first.generatedAt, t1), true, 'besteht weiter → Mail');

  const t2 = new Date(t1.getTime() + hour);
  const third = await run(second, t2);
  assert.equal(shouldAlert(problems(third), second.generatedAt, t2), false, 'keine Mail jede Stunde');

  const evening = new Date(`${TODAY}T16:23:00Z`); // 18:23 Uhr: tägliche Erinnerung
  assert.equal(shouldAlert(problems(await run(third, evening)), third.generatedAt, evening), true);

  // Wieder in Ordnung → kein "seit"
  const fixed = await collect({ today: TODAY, cinemas: cinemas.slice(1, 2), sources: { broken: async () => [{ date: TODAY, time: '20:00', title: 'Alte Liebe' }] }, previous: third, now: t2 });
  assert.equal(fixed.cinemas[0].status, 'ok');
  assert.equal(fixed.cinemas[0].since, undefined);
});

test('Ergänzungsquelle füllt Tage, die der Hauptquelle noch fehlen', async () => {
  const main = [
    { date: '2026-10-06', time: '17:00', title: 'Digger', url: 'https://tickets.example/1' },
    { date: '2026-10-06', time: '20:00', title: 'Hope', url: 'https://tickets.example/2' },
    { date: '2026-10-08', time: '22:00', title: 'Überraschungspremiere', url: 'https://tickets.example/3' },
  ];
  const extra = [
    { date: '2026-10-06', time: '17:00', title: 'Digger' },
    { date: '2026-10-06', time: '20:00', title: 'Hope' },
    { date: '2026-10-08', time: '15:00', title: 'Digger' },
    { date: '2026-10-08', time: '18:00', title: 'Hope' },
  ];
  // 06.10.: Gleichstand → Hauptquelle (mit Links); 08.10.: Ergänzung kennt mehr → Ergänzung
  assert.deepEqual(
    mergeByDay(main, extra).map((s) => [s.date, s.time, Boolean(s.url)]),
    [
      ['2026-10-06', '17:00', true],
      ['2026-10-06', '20:00', true],
      ['2026-10-08', '15:00', false],
      ['2026-10-08', '18:00', false],
    ],
  );

  // Über collect: Quelle in der Kinoliste, Ausfall der Ergänzung ist kein Fehler
  const cinema = { ...cinemas[0], source: { type: 'direct', supplement: { type: 'extra' } } };
  const failing = await collect({
    today: TODAY,
    cinemas: [cinema],
    sources: {
      direct: async () => [{ date: TODAY, time: '20:00', title: 'Hope' }],
      extra: async () => {
        throw new Error('HTTP 503');
      },
    },
  });
  assert.equal(failing.cinemas[0].status, 'ok');
  assert.equal(failing.cinemas[0].source, 'direct + extra');
  assert.equal(failing.shows.length, 1);
});
