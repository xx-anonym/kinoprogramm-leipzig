import { test } from 'node:test';
import assert from 'node:assert/strict';

import { chooseDisplayTitles, filmKey, parseTitle, splitEvent, versionFromText } from '../src/lib/normalize.js';
import { addDays, inferYear, parseGermanDate, parseTime } from '../src/lib/dates.js';

test('parseTitle trennt Fassung und 3D vom Titel', () => {
  const cases = [
    ['GENTLE MONSTER (OmeU)', 'GENTLE MONSTER', 'OmeU', []],
    ['Digger (in OmdU) im engl. Original m.d. Untertitel!', 'Digger', 'OmU', []],
    ['Digger in OmdU', 'Digger', 'OmU', []],
    ['The Odyssey (OV, ohne Untertitel)', 'The Odyssey', 'OV', []],
    ['25 Jahre DER HERR DER RINGE – Extended Triple (OmU) (OV)', '25 Jahre DER HERR DER RINGE – Extended Triple', 'OmU', []],
    ['ANSTATT BÄUMEN (OmU) + Filmgespräch', 'ANSTATT BÄUMEN + Filmgespräch', 'OmU', []],
    ['Vaterland (dt.)', 'Vaterland', null, []],
    ['Emil und die Detektive (2026)', 'Emil und die Detektive', null, []],
    ['Avatar 3D', 'Avatar', null, ['3D']],
    ['Ivanov', 'Ivanov', null, []],
  ];
  for (const [raw, title, version, extras] of cases) {
    assert.deepEqual(parseTitle(raw), { title, version, extras }, raw);
  }
});

test('versionFromText versteht die Schreibweisen der Ticketsysteme', () => {
  assert.equal(versionFromText('OmU, Originalversion'), 'OmU');
  assert.equal(versionFromText('OmeU, Originalversion'), 'OmeU');
  assert.equal(versionFromText('OV, Originalversion'), 'OV');
  assert.equal(versionFromText('D, Deutsch'), null);
  assert.equal(versionFromText('Original mit Untertiteln'), 'OmU');
});

test('filmKey fasst unterschiedliche Schreibweisen zusammen', () => {
  assert.equal(filmKey('Coyote vs. ACME'), filmKey('Coyote vs Acme'));
  assert.equal(filmKey('Arnie & Barney – Retten das Wasser'), filmKey('Arnie & Barney retten das Wasser'));
  assert.equal(filmKey('FRAU WINKLER VERLÄSST DAS HAUS'), filmKey('Frau Winkler verlässt das Haus'));
  assert.notEqual(filmKey('Digger'), filmKey('Diggers'));
});

test('splitEvent trennt Veranstaltungs-Zusätze vom Filmtitel', () => {
  const cases = [
    ['„Literatur trifft Film": DIE BLECHTROMMEL', 'DIE BLECHTROMMEL', 'Literatur trifft Film'],
    ['„Special Screening zu Beginn der Herbstferien": MIRA', 'MIRA', 'Special Screening zu Beginn der Herbstferien'],
    ['Premiere: ALTE LIEBE', 'ALTE LIEBE', 'Premiere'],
    ['Zusatz-Premiere: HEIMSUCHUNG - EINE JAHRHUNDERTGESCHICHTE', 'HEIMSUCHUNG - EINE JAHRHUNDERTGESCHICHTE', 'Zusatz-Premiere'],
    ['Pans Labyrinth - Best of Cinema', 'Pans Labyrinth', 'Best of Cinema'],
    ['ANSTATT BÄUMEN + Filmgespräch mit Regisseur Philipp Hartmann', 'ANSTATT BÄUMEN', '+ Filmgespräch mit Regisseur Philipp Hartmann'],
    ['Reihe Zeitlos: HARD BOILED', 'HARD BOILED', 'Reihe Zeitlos'],
    // unverändert: echte Titel mit Doppelpunkt, Sneaks, Doppelvorstellungen
    ['Avengers: Endgame', 'Avengers: Endgame', null],
    ['CineSneak OV: The original surprise preview', 'CineSneak OV: The original surprise preview', null],
    ['Horror-Doppel mit Donis: Backrooms + Obsession', 'Horror-Doppel mit Donis: Backrooms + Obsession', null],
  ];
  for (const [raw, title, label] of cases) assert.deepEqual(splitEvent(raw), { title, label }, raw);
});

test('filmKey ignoriert führende Artikel und Apostrophe', () => {
  assert.equal(filmKey('DER SPAZIERGANG NACH SYRAKUS'), filmKey('Spaziergang nach Syrakus'));
  assert.equal(filmKey("Pan's Labyrinth"), filmKey('Pans Labyrinth'));
  assert.equal(filmKey('The Invite'), filmKey('Invite'));
  assert.notEqual(filmKey('Dieter'), filmKey('ter'), 'nur ganze Wörter');
});

test('chooseDisplayTitles bevorzugt normale Schreibweise vor Versalien', () => {
  const titles = chooseDisplayTitles(['ALTE LIEBE', 'ALTE LIEBE', 'Alte Liebe', 'HOPPERS']);
  assert.equal(titles.get(filmKey('Alte Liebe')), 'Alte Liebe');
  assert.equal(titles.get(filmKey('HOPPERS')), 'HOPPERS');
});

test('Datumshilfen inkl. Jahreswechsel', () => {
  assert.equal(inferYear(2, 1, '2026-12-30'), '2027-01-02');
  assert.equal(inferYear(30, 12, '2027-01-02'), '2026-12-30');
  assert.equal(parseGermanDate('05.10.', '2026-10-04'), '2026-10-05');
  assert.equal(parseGermanDate('Mo, 05.10.2026', '2020-01-01'), '2026-10-05');
  assert.equal(parseTime('9.30 Uhr'), '09:30');
  assert.equal(addDays('2026-10-25', 1), '2026-10-26');
});
