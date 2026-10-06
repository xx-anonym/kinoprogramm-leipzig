// Parser-Tests mit echten (gekürzten) Ausschnitten der Kino-Webseiten.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { parseCinestar } from '../src/sources/cinestar.js';
import { parseCinetixx } from '../src/sources/cinetixx.js';
import { parsePassage, parsePassageDuration } from '../src/sources/passage.js';
import { parseSchauburg } from '../src/sources/schauburg.js';
import { parseCineprog } from '../src/sources/cineprog.js';
import { parseKinozeit } from '../src/sources/kinozeit.js';
import { parseIcal } from '../src/sources/ical.js';
import { parseKinoheld } from '../src/sources/kinoheld.js';

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

test('CineStar: Ortszeit, OV/OmU, IMAX und Ticketlink', () => {
  const shows = parseCinestar(JSON.parse(fixture('cinestar.json')), {
    ticketingLink: 'https://webticketing3.cinestar.de/?cinemaId=43337&movieSessionId=%SYSTEM_SESSION_ID%',
  });
  assert.equal(shows.length, 4);
  assert.deepEqual(shows[0], {
    date: '2026-10-07',
    time: '19:50',
    title: 'Digger',
    version: null,
    extras: [],
    url: 'https://webticketing3.cinestar.de/?cinemaId=43337&movieSessionId=183757',
    duration: null,
  });
  assert.deepEqual(shows[2].extras, ['IMAX']);
  assert.equal(shows[2].version, 'OV');
  assert.equal(shows[3].version, 'OmU');
});

test('CineStar: Filmlänge aus den abgerufenen Details', () => {
  const shows = parseCinestar(JSON.parse(fixture('cinestar.json')), { durations: new Map([[226596, 129]]) });
  assert.deepEqual(
    shows.map((s) => s.duration),
    [129, 129, 129, null],
  );
});

test('CineStar: ohne Ticketlink wird die Filmseite verlinkt', () => {
  const [show] = parseCinestar(JSON.parse(fixture('cinestar.json')));
  assert.equal(show.url, 'https://www.cinestar.de/kino-leipzig/film/digger');
});

test('Cinetixx: Fassung aus dem Sprachfeld, Saal und https-Buchungslink', () => {
  const shows = parseCinetixx(JSON.parse(fixture('cinetixx.json')), '1898834974');
  assert.equal(shows.length, 4);
  assert.equal(shows[0].date, '2026-10-04');
  assert.equal(shows[0].time, '12:30');
  assert.equal(shows[0].version, 'OmeU');
  assert.equal(shows[0].screen, 'Ballsaal');
  assert.equal(shows[0].duration, 123);
  assert.match(shows[0].url, /^https:\/\/booking\.cinetixx\.de\//);
  assert.equal(shows[1].version, 'OmU');
  assert.equal(shows[2].version, null);
});

test('Cinetixx: Vorstellungen anderer Spielstätten werden ignoriert', () => {
  assert.equal(parseCinetixx(JSON.parse(fixture('cinetixx.json')), '1').length, 0);
});

test('Passage Kinos: Datum, Saal und OmU-Symbol', () => {
  const shows = parsePassage(fixture('passage.html'));
  assert.match(shows[0].description, /Pawlikowski/);
  assert.deepEqual(shows.map(({ description, ...rest }) => rest), [
    { date: '2026-10-05', time: '13:30', title: 'Vaterland', version: null, screen: 'Casino', url: 'https://www.passage-kinos.de/vaterland' },
    {
      date: '2026-10-05',
      time: '13:45',
      title: 'Shaun das Schaf - Spuk im Kürbisfeld',
      version: null,
      screen: 'Astoria',
      url: 'https://www.passage-kinos.de/shaun-das-schaf-spuk-im-kuerbisfeld',
    },
    { date: '2026-10-05', time: '18:00', title: 'Digger', version: 'OmU', screen: 'Astoria', url: 'https://www.passage-kinos.de/digger' },
  ]);
});

test('Passage Kinos: Filmlänge von der Filmseite', () => {
  assert.equal(parsePassageDuration(fixture('passage-film.html')), 82);
  assert.equal(parsePassageDuration('<p>Keine Angabe</p>'), null);
});

test('Schauburg: Datum und Uhrzeit gelten für Folgeeinträge mit', () => {
  const shows = parseSchauburg(fixture('schauburg.html'), '2026-10-04');
  assert.deepEqual(
    shows.map((s) => [s.date, s.time, s.title]),
    [
      ['2026-10-04', '14:15', 'Shaun das Schaf - Spuk im Kürbisfeld'],
      ['2026-10-04', '14:15', 'Arnie & Barney retten das Wasser'],
      ['2026-10-04', '15:15', 'Bibi Blocksberg - Die total verhexte Zeitreise'],
      ['2026-10-05', '19:15', 'Frau Winkler verlässt das Haus'],
    ],
  );
  assert.equal(shows[0].url, 'https://www.schauburg-leipzig.de/filmdetails/shaun-das-schaf-spuk-im-kuerbisfeld');
  assert.deepEqual(
    shows.map((s) => s.duration),
    [90, 80, 95, shows[3].duration],
  );
  assert.ok(shows[3].duration > 0);
});

test('cineprog (Regina Palast): eingebettetes JSON, Einzel- und Mehrfachtermine, OV', () => {
  const shows = parseCineprog(fixture('cineprog.html'));
  assert.equal(shows.length, 6);
  assert.deepEqual(
    shows.filter((s) => s.title === 'Digger').map((s) => `${s.date} ${s.time} ${s.screen}`),
    ['2026-10-04 17:30 Kino 1', '2026-10-04 20:15 Kino 1', '2026-10-05 17:15 Kino 1', '2026-10-05 20:30 Kino 4'],
  );
  const verity = shows.find((s) => s.title === 'Verity');
  assert.equal(verity.version, 'OV');
  assert.equal(verity.duration, 117);
  assert.equal(shows.find((s) => s.title === 'Digger').duration, 129);
  assert.equal(shows.find((s) => s.title === 'Sneak Preview').duration, null, 'Sneak: Länge unbekannt');
  assert.match(verity.url, /^https:\/\/www\.kinoheld\.de\//);
  assert.equal(shows.find((s) => s.title === 'Sneak Preview').date, '2026-10-06');
});

test('iCal (Cineding): gefaltete Zeilen, Escapes und UTC-Zeiten', () => {
  const shows = parseIcal(fixture('cineding.ics'));
  assert.equal(shows[0].description, 'Das letzte Foto, das Jessie gemacht hat, zeigt die Sonne über Berlin.');
  assert.deepEqual(shows.map(({ description, ...rest }) => rest), [
    // Ende = Beginn → Länge unbekannt
    { date: '2026-10-08', time: '19:00', title: 'EVERYTIME', url: 'https://www.cineding-leipzig.de/veranstaltungen/everytime-2/', duration: null },
    {
      date: '2026-10-10',
      time: '19:00',
      title: 'ANSTATT BÄUMEN (OmU) + Filmgespräch mit Regisseur Philipp Hartmann',
      url: 'https://www.cineding-leipzig.de/veranstaltungen/anstatt-baeumen/',
      duration: null,
    },
    // 20:00 UTC = 21:00 Winterzeit in Leipzig
    { date: '2026-12-31', time: '21:00', title: 'Silvester, Sekt & Kurzfilme', url: null, duration: 90 },
  ]);
});

test('kinoheld (Cineplex, UCI): Ortszeit, 3D und Ticketlink', () => {
  const shows = parseKinoheld(JSON.parse(fixture('kinoheld.json')));
  assert.deepEqual(shows.map(({ description, ...rest }) => rest), [
    {
      date: '2026-10-05',
      time: '14:30',
      title: 'Coyote vs. Acme',
      version: null,
      extras: [],
      url: 'https://tickets.cineplex.de/checkout/356/A5CBFB00023FWBXJYB',
      duration: 101,
    },
    {
      date: '2026-10-05',
      time: '17:00',
      title: 'Verity - Dunkle Geheimnisse',
      version: null,
      extras: [],
      url: 'https://tickets.cineplex.de/checkout/356/7CCBFB00023FWBXJYB',
      duration: 114,
    },
    // Winterzeit: Offset +01:00, die Uhrzeit bleibt Ortszeit
    {
      date: '2026-12-16',
      time: '16:30',
      title: 'Avengers: Doomsday',
      version: null,
      extras: ['3D'],
      url: 'https://tickets.cineplex.de/checkout/356/51BAFB00023FWBXJYB',
      duration: 165,
    },
  ]);
});

test('kinoheld: Fassung aus Ton- und Untertitelsprache', () => {
  const show = (audio, subtitles) => ({
    name: 'Film',
    beginning: '2026-10-05T20:00:00+02:00',
    audioLanguage: audio ? { isocode: audio } : null,
    subtitleLanguage: subtitles ? { isocode: subtitles } : null,
    flags: [],
  });
  const versions = parseKinoheld({
    data: { shows: { data: [show('en', 'de'), show('ko', 'en'), show('en', null), show('de', null), show(null, null)] } },
  }).map((s) => s.version);
  assert.deepEqual(versions, ['OmU', 'OmeU', 'OV', null, null]);
});

test('kinoheld: Fehlermeldungen der API werden weitergereicht', () => {
  assert.throws(() => parseKinoheld({ errors: [{ message: 'The limit may not be greater than 500.' }] }), /limit/);
});

test('kino-zeit: Programm aus den strukturierten Daten (JSON-LD)', () => {
  const shows = parseKinozeit(fixture('kinozeit.html'));
  assert.equal(shows.length, 5);
  assert.deepEqual(
    shows.map((s) => [s.date, s.time, s.title]),
    [
      ['2026-10-06', '16:45', 'Adams Acht'],
      ['2026-10-11', '20:10', 'The Social Reckoning (OF)'],
      ['2026-10-09', '19:30', 'Forgotten Island 3D'],
      ['2026-10-07', '19:30', 'Avengers: Endgame Extended'],
      ['2026-10-08', '14:00', 'Minions & Monster'],
    ],
  );
  assert.match(shows[3].description, /Infinity War die Hälfte/, 'HTML-Entitäten werden aufgelöst');
  assert.throws(() => parseKinozeit('<html></html>'), /kein Kinoprogramm/);
});
