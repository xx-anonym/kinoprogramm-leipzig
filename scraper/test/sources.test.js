// Parser-Tests mit echten (gekürzten) Ausschnitten der Kino-Webseiten.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { parseCinestar } from '../src/sources/cinestar.js';
import { parseCinetixx } from '../src/sources/cinetixx.js';
import { parsePassage } from '../src/sources/passage.js';
import { parseSchauburg } from '../src/sources/schauburg.js';
import { parseKinotickets } from '../src/sources/kinotickets.js';
import { parseCineprog } from '../src/sources/cineprog.js';
import { parseIcal } from '../src/sources/ical.js';
import { parseKinoprogrammLeipzig } from '../src/sources/kinoprogrammLeipzig.js';

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
  });
  assert.deepEqual(shows[2].extras, ['IMAX']);
  assert.equal(shows[2].version, 'OV');
  assert.equal(shows[3].version, 'OmU');
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
  assert.match(shows[0].url, /^https:\/\/booking\.cinetixx\.de\//);
  assert.equal(shows[1].version, 'OmU');
  assert.equal(shows[2].version, null);
});

test('Cinetixx: Vorstellungen anderer Spielstätten werden ignoriert', () => {
  assert.equal(parseCinetixx(JSON.parse(fixture('cinetixx.json')), '1').length, 0);
});

test('Passage Kinos: Datum, Saal und OmU-Symbol', () => {
  const shows = parsePassage(fixture('passage.html'));
  assert.deepEqual(shows, [
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
});

test('kinotickets.express (Taucha): Tage und Buchungslinks', () => {
  const shows = parseKinotickets(fixture('kinotickets.html'), '2026-10-04');
  assert.deepEqual(
    shows.map((s) => [s.date, s.time, s.title]),
    [
      ['2026-10-05', '15:00', 'Bibi Blocksberg - Die total verhexte Zeitreise'],
      ['2026-10-06', '15:00', 'Bibi Blocksberg - Die total verhexte Zeitreise'],
      ['2026-10-07', '15:00', 'Bibi Blocksberg - Die total verhexte Zeitreise'],
    ],
  );
  assert.equal(shows[0].url, 'https://kinotickets.express/taucha-ct-lichtspiele/booking/22268');
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
  assert.match(verity.url, /^https:\/\/www\.kinoheld\.de\//);
  assert.equal(shows.find((s) => s.title === 'Sneak Preview').date, '2026-10-06');
});

test('iCal (Cineding): gefaltete Zeilen, Escapes und UTC-Zeiten', () => {
  const shows = parseIcal(fixture('cineding.ics'));
  assert.deepEqual(shows, [
    { date: '2026-10-08', time: '19:00', title: 'EVERYTIME', url: 'https://www.cineding-leipzig.de/veranstaltungen/everytime-2/' },
    {
      date: '2026-10-10',
      time: '19:00',
      title: 'ANSTATT BÄUMEN (OmU) + Filmgespräch mit Regisseur Philipp Hartmann',
      url: 'https://www.cineding-leipzig.de/veranstaltungen/anstatt-baeumen/',
    },
    // 20:00 UTC = 21:00 Winterzeit in Leipzig
    { date: '2026-12-31', time: '21:00', title: 'Silvester, Sekt & Kurzfilme', url: null },
  ]);
});

test('kinoprogramm-leipzig.de: Kinos, Tage und Fassungs-Badges', () => {
  const cinemas = parseKinoprogrammLeipzig(fixture('kinoprogramm-leipzig.html'), '2026-10-04');
  assert.deepEqual(Object.keys(cinemas).sort(), ['43', '52']);
  assert.equal(cinemas['43'].name, 'Cineding');
  assert.equal(cinemas['43'].address, 'Karl-Heine-Str. 83 04229 Leipzig - Plagwitz');
  assert.deepEqual(
    cinemas['43'].shows.map((s) => `${s.date} ${s.time} ${s.title}`),
    ['2026-10-01 19:00 Hiddensee', '2026-10-01 21:15 Staatsschutz', '2026-10-02 19:00 Hiddensee', '2026-10-02 21:15 Staatsschutz'],
  );
  const cinestar = cinemas['52'].shows;
  assert.deepEqual(cinestar.find((s) => s.title === 'Avengers: Endgame').extras, ['3D']);
  assert.equal(cinestar.find((s) => s.title === 'LINKIN PARK: UNSHATTER').version, 'OmU');
});
