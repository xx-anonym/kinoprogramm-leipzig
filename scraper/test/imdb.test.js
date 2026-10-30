// Zuordnung zu IMDb und Zwischenspeicher – ohne Netzwerk (Lader werden ersetzt).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isEvent, pickCandidate, queryKeys, ratingsForProgram, refreshImdb, MIN_VOTES } from '../src/imdb.js';

const opts = { currentYear: 2026 };

test('Veranstaltungen bekommen keine Bewertung', () => {
  for (const t of [
    'Sneak Preview',
    'Horror Sneak',
    'Live aus der MET: Verdi: Macbeth',
    'Macbeth - Verdi (MET 2026/27)',
    'Verdi: Macbeth',
    'Met Opera 2026-27: Macbeth - Giuseppe Verdi',
    'Zeise Shortfilm Slam',
    'Überraschungspremiere',
  ]) {
    assert.ok(isEvent(t), t);
  }
  for (const t of ['Die Odyssee', 'Metropolis', 'Macbeth', 'Hope', 'Meeting the Buddha']) assert.equal(isEvent(t), false, t);
});

test('Suchschlüssel: Titel, Originaltitel und (nur als Notlösung) der Haupttitel', () => {
  const { title, original, main } = queryKeys({ title: 'Die vergessene Insel', original: 'Forgotten Island' });
  assert.deepEqual([...title], ['vergesseneinsel']);
  assert.deepEqual([...original], ['forgottenisland']);
  assert.equal(main.size, 0);
  const verity = queryKeys({ title: 'Verity - Dunkle Geheimnisse' });
  assert.deepEqual([...verity.title], ['veritydunklegeheimnisse']);
  assert.deepEqual([...verity.main], ['verity']);
});

test('Gleicher Titel, verschiedene Filme: Jahr und Laufzeit entscheiden', () => {
  const candidates = [
    { id: 'tt0001', year: 1997, runtime: 104, votes: 900000, via: 'title' },
    { id: 'tt0002', year: 2026, runtime: 172, votes: 52000, via: 'title' },
  ];
  assert.equal(pickCandidate({ title: 'Die Odyssee', year: 2026 }, candidates, opts).id, 'tt0002');
  assert.equal(pickCandidate({ title: 'Die Odyssee', duration: 170 }, candidates, opts).id, 'tt0002');
  // ohne Hinweise: der aktuelle Film (es läuft im Kino)
  assert.equal(pickCandidate({ title: 'Die Odyssee' }, candidates, opts).id, 'tt0002');
  // Wiederaufführung: Kino nennt das Jahr der Wiederaufführung, die Laufzeit passt zum Klassiker
  const akira = [{ id: 'tt0094625', year: 1988, runtime: 124, votes: 230000, via: 'title' }];
  assert.equal(pickCandidate({ title: 'Akira', year: 2026, duration: 124 }, akira, opts).id, 'tt0094625');
  // Klassiker gegen unbekannten Namensvetter: Laufzeit und Bekanntheit schlagen "aktuell"
  const drive = [
    { id: 'tt0780504', year: 2011, runtime: 100, votes: 700000, via: 'title' },
    { id: 'tt9999999', year: 2025, runtime: 105, votes: 280, via: 'title' },
  ];
  assert.equal(pickCandidate({ title: 'Drive', duration: 100 }, drive, opts).id, 'tt0780504');
});

test('Wiederaufführung mit Jahr im Titel: der Klassiker, nicht die Neuverfilmung', () => {
  const killer = [
    { id: 'tt0097202', year: 1989, runtime: 111, votes: 80000, via: 'title' }, // John Woo
    { id: 'tt1136617', year: 2023, runtime: 118, votes: 250000, via: 'title' }, // David Fincher
    { id: 'tt1121948', year: 2024, runtime: 126, votes: 19000, via: 'title' }, // Neuverfilmung
  ];
  // kinoheld nennt fälschlich 2024, das Studio-Kino "Killer, The (1989) (WA: 2026)"
  assert.equal(pickCandidate({ title: 'The Killer', year: 2024, duration: 110 }, killer, opts).id, 'tt1121948');
  assert.equal(pickCandidate({ title: 'The Killer', year: 1989, duration: 110 }, killer, opts).id, 'tt0097202');
});

test('Zwischenspeicher: ändert sich das Jahr eines Films, wird neu zugeordnet', async () => {
  const candidates = [
    { id: 'tt0097202', year: 1989, runtime: 111, votes: 80000, via: 'title' },
    { id: 'tt1121948', year: 2024, runtime: 126, votes: 19000, via: 'title' },
  ];
  let calls = 0;
  const findCandidates = async (films) => (calls++, new Map(films.map((f) => [f.key, candidates])));
  const loadRatings = async () => new Map([['tt0097202', { rating: 7.7, votes: 80000 }], ['tt1121948', { rating: 5.7, votes: 19000 }]]);
  const now = new Date('2026-10-30T10:00:00Z');
  const first = await refreshImdb({ films: [{ key: 'killer', title: 'The Killer', year: 2024, duration: 110 }], cache: null, now, loadRatings, findCandidates });
  assert.equal(first.films.killer.id, 'tt1121948');
  const same = await refreshImdb({ films: [{ key: 'killer', title: 'The Killer', year: 2024, duration: 110 }], cache: first, now, loadRatings, findCandidates });
  assert.equal(calls, 1, 'gleiches Jahr: nichts zu tun');
  assert.equal(same.films.killer.id, 'tt1121948');
  const fixed = await refreshImdb({ films: [{ key: 'killer', title: 'The Killer', year: 1989, duration: 110 }], cache: first, now, loadRatings, findCandidates });
  assert.equal(calls, 2);
  assert.deepEqual(fixed.films.killer, { id: 'tt0097202', title: 'The Killer', year: 1989, seen: '2026-10-30', rating: 7.7, votes: 80000 });
  // ältere Einträge ohne gemerktes Jahr werden nicht alle neu zugeordnet
  const old = { films: { killer: { id: 'tt1121948', title: 'The Killer', seen: '2026-10-29', rating: 5.7, votes: 19000 } } };
  await refreshImdb({ films: [{ key: 'killer', title: 'The Killer', year: 1989 }], cache: old, now, loadRatings, findCandidates });
  assert.equal(calls, 2);
});

test('Im Zweifel keine Bewertung', () => {
  // Laufzeit passt überhaupt nicht
  assert.equal(pickCandidate({ title: 'Hope', duration: 95 }, [{ id: 'tt1', year: 2026, runtime: 160, votes: 500, via: 'title' }], opts), null);
  // Nur der Haupttitel stimmt überein und nichts sonst passt
  assert.equal(pickCandidate({ title: 'Verity - Dunkle Geheimnisse' }, [{ id: 'tt2', year: 2012, runtime: 88, votes: 40, via: 'main' }], opts), null);
  // Nur über einen (falschen) Originaltitel gefunden, alter unbekannter Film → lieber nichts
  assert.equal(
    pickCandidate({ title: 'Traces of Justice', original: 'Mission of Justice', duration: 94 }, [{ id: 'tt4', year: 1992, runtime: 91, votes: 1387, via: 'original' }], opts),
    null,
  );
  // Haupttitel + passendes Jahr: wird genommen
  assert.equal(
    pickCandidate({ title: 'Verity - Dunkle Geheimnisse', year: 2026 }, [{ id: 'tt3', year: 2026, runtime: 114, votes: 9000, via: 'main' }], opts).id,
    'tt3',
  );
});

test('Zwischenspeicher: neue Filme zuordnen, Bewertungen auffrischen, Erfolglose später erneut versuchen', async () => {
  const now = new Date('2026-10-11T10:00:00Z');
  let candidateCalls = 0;
  const findCandidates = async (films) => {
    candidateCalls++;
    return new Map(films.filter((f) => f.key === 'odyssee').map((f) => [f.key, [{ id: 'tt0002', year: 2026, runtime: 172, votes: 52000, via: 'title' }]]));
  };
  const loadRatings = async () => new Map([['tt0002', { rating: 7.4, votes: 52000 }]]);
  const films = [
    { key: 'odyssee', title: 'Die Odyssee', year: 2026 },
    { key: 'sneakpreview', title: 'Sneak Preview' },
    { key: 'unbekannt', title: 'Unbekannter Film' },
  ];

  const first = await refreshImdb({ films, cache: null, now, loadRatings, findCandidates });
  assert.deepEqual(first.films.odyssee, { id: 'tt0002', title: 'Die Odyssee', year: 2026, seen: '2026-10-11', rating: 7.4, votes: 52000 });
  assert.equal(first.films.sneakpreview.skip, true);
  assert.equal(first.films.unbekannt.id, null);
  assert.equal(candidateCalls, 1);

  // Eine Stunde später: nichts Neues → keine großen Downloads, keine neuen Bewertungen
  const later = await refreshImdb({ films, cache: first, now: new Date('2026-10-11T11:00:00Z'), loadRatings, findCandidates });
  assert.equal(candidateCalls, 1);
  assert.equal(later.ratingsUpdated, first.ratingsUpdated);

  // Eine Woche später: der unbekannte Film wird erneut gesucht
  await refreshImdb({ films, cache: first, now: new Date('2026-10-19T10:00:00Z'), loadRatings, findCandidates });
  assert.equal(candidateCalls, 2);

  // Für die Seite: nur zugeordnete Filme mit genug Stimmen
  assert.deepEqual([...ratingsForProgram(first)], [['odyssee', { id: 'tt0002', rating: 7.4, votes: 52000 }]]);
  const few = { films: { neu: { id: 'tt9', rating: 9.1, votes: MIN_VOTES - 1 } } };
  assert.equal(ratingsForProgram(few).size, 0);
});
