// Sammelt das Programm aller Kinos und schreibt public/data/program.json.
//
//   node src/index.js            # Daten holen und schreiben
//   node src/index.js --dry-run  # nur holen und Zusammenfassung ausgeben

import { readFile, writeFile, mkdir, appendFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CINEMAS } from './cinemas.js';
import { addDays, berlinDate, berlinTime } from './lib/dates.js';
import { buildCaseDictionary, chooseDisplayTitles, filmKey, parseTitle, pickVersion, smartCase, splitEvent } from './lib/normalize.js';
import { cinestar } from './sources/cinestar.js';
import { cinetixx } from './sources/cinetixx.js';
import { passage } from './sources/passage.js';
import { schauburg } from './sources/schauburg.js';
import { cineprog } from './sources/cineprog.js';
import { ical } from './sources/ical.js';
import { kinoheld } from './sources/kinoheld.js';

const OUT_FILE = fileURLToPath(new URL('../../public/data/program.json', import.meta.url));

/** Heute + 7 Tage, damit die Seite auch am Folgetag noch eine volle Woche zeigt. */
export const DAYS = 8;

export const SOURCES = { cinestar, cinetixx, passage, schauburg, cineprog, ical, kinoheld };

const SOURCE_LABELS = {
  cinestar: 'cinestar.de',
  cinetixx: 'cinetixx.de',
  passage: 'passage-kinos.de',
  schauburg: 'schauburg-leipzig.de',
  cineprog: 'kinoleipzig.com',
  ical: 'cineding-leipzig.de',
  kinoheld: 'kinoheld.de',
};

const errorMessage = (err) => String(err?.message ?? err).slice(0, 300);

/** Bereinigt die Rohdaten einer Quelle: Titel/Fassung trennen, Zeitraum filtern. */
function normalizeShows(rawShows, cinemaId, days) {
  const first = days[0];
  const last = days[days.length - 1];
  const result = [];
  for (const raw of rawShows) {
    if (!raw?.date || !raw?.time || raw.date < first || raw.date > last) continue;
    const parsed = parseTitle(raw.title);
    if (!parsed.title) continue;
    // "Premiere: ALTE LIEBE" → Film "ALTE LIEBE" mit Etikett "Premiere"
    const event = splitEvent(parsed.title);
    result.push({
      cinema: cinemaId,
      date: raw.date,
      time: raw.time,
      title: event.title,
      label: raw.label || event.label,
      version: pickVersion(raw.version, parsed.version),
      extras: [...new Set([...(raw.extras ?? []), ...parsed.extras])],
      screen: raw.screen || null,
      url: /^https?:\/\//i.test(raw.url ?? '') ? raw.url : null,
      duration: raw.duration >= 20 && raw.duration <= 720 ? Math.round(raw.duration) : null,
      description: typeof raw.description === 'string' ? raw.description : null, // nur für die Schreibweise
    });
  }
  return result;
}

/** Vorstellungen eines Kinos aus dem letzten Lauf (falls heute alle Quellen ausfallen). */
function previousShows(previous, cinemaId, days) {
  if (!previous?.shows) return [];
  const films = previous.films ?? {};
  return normalizeShows(
    previous.shows
      .filter((s) => s.cinema === cinemaId)
      .map((s) => ({ ...s, title: films[s.film]?.title ?? s.film, duration: films[s.film]?.duration })),
    cinemaId,
    days,
  );
}

/** Häufigste Filmlänge eines Films über alle Kinos (bei Gleichstand die längere). */
function filmDurations(shows) {
  const counts = new Map();
  for (const s of shows) {
    if (!s.duration) continue;
    const key = filmKey(s.title);
    if (!counts.has(key)) counts.set(key, new Map());
    const perFilm = counts.get(key);
    perFilm.set(s.duration, (perFilm.get(s.duration) ?? 0) + 1);
  }
  const result = new Map();
  for (const [key, perFilm] of counts) {
    const [best] = [...perFilm.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
    result.set(key, best[0]);
  }
  return result;
}

/**
 * Holt alle Kinos. Fällt die Quelle eines Kinos aus, bleiben dessen Vorstellungen vom letzten Lauf stehen.
 * Abhängigkeiten sind injizierbar, damit sich das in Tests ohne Netz prüfen lässt.
 */
export async function collect({ today, cinemas = CINEMAS, sources = SOURCES, previous = null, now = new Date() }) {
  const days = Array.from({ length: DAYS }, (_, i) => addDays(today, i));
  const context = { today, days };
  const nowTime = berlinTime(now);

  const results = await Promise.all(
    cinemas.map(async (cinema) => {
      const type = cinema.source.type;
      const base = {
        id: cinema.id,
        name: cinema.name,
        address: cinema.address,
        website: cinema.website,
        source: SOURCE_LABELS[type] ?? type,
      };
      try {
        const fetcher = sources[type];
        if (!fetcher) throw new Error(`Unbekannte Quelle "${type}"`);
        const raw = await fetcher(cinema.source, context);
        const shows = normalizeShows(raw, cinema.id, days);
        // Gar nichts gefunden, obwohl beim letzten Abruf noch kommende Vorstellungen angekündigt waren?
        // Dann hat sich vermutlich die Webseite geändert – lieber die alten Daten behalten und Alarm
        // schlagen. (Waren nur noch heutige, schon begonnene übrig, ist "nichts" dagegen normal.)
        if (raw.length === 0) {
          const old = previousShows(previous, cinema.id, days);
          if (old.some((s) => s.date > today || (s.date === today && s.time > nowTime))) {
            return {
              cinema: { ...base, status: 'stale', message: 'Keine Vorstellungen gefunden – hat sich die Webseite des Kinos geändert?' },
              shows: old,
            };
          }
        }
        return { cinema: { ...base, status: 'ok' }, shows };
      } catch (err) {
        const old = previousShows(previous, cinema.id, days);
        return { cinema: { ...base, status: old.length ? 'stale' : 'error', message: errorMessage(err) }, shows: old };
      }
    }),
  );

  // Filmtitel über alle Kinos vereinheitlichen
  const allShows = results.flatMap((r) => r.shows);
  const displayTitles = chooseDisplayTitles(allShows.map((s) => s.title));
  const durations = filmDurations(allShows);
  // Wörterbuch aus Beschreibungen und Titeln, um Titel in VERSALIEN normal zu schreiben
  const caseDictionary = buildCaseDictionary(new Set([...allShows.map((s) => s.description), ...allShows.map((s) => s.title)]));
  const films = {};
  const seen = new Set();
  const shows = [];
  const cinemaOrder = new Map(results.map((r, i) => [r.cinema.id, i]));
  for (const s of allShows) {
    const film = filmKey(s.title);
    const dedupeKey = [s.cinema, s.date, s.time, film, s.version ?? ''].join('|');
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    if (!films[film]) {
      films[film] = { title: smartCase(displayTitles.get(film), caseDictionary) };
      if (durations.has(film)) films[film].duration = durations.get(film);
    }
    const show = { cinema: s.cinema, film, date: s.date, time: s.time };
    if (s.version) show.version = s.version;
    if (s.extras.length) show.extras = s.extras;
    if (s.label) show.label = s.label;
    if (s.screen) show.screen = s.screen;
    if (s.url) show.url = s.url;
    shows.push(show);
  }
  shows.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.time.localeCompare(b.time) ||
      cinemaOrder.get(a.cinema) - cinemaOrder.get(b.cinema) ||
      films[a.film].title.localeCompare(films[b.film].title, 'de'),
  );

  const counts = {};
  for (const s of shows) counts[s.cinema] = (counts[s.cinema] ?? 0) + 1;
  const cinemaList = results.map((r) => ({ ...r.cinema, shows: counts[r.cinema.id] ?? 0 }));

  return {
    generatedAt: now.toISOString(),
    days,
    cinemas: cinemaList,
    films: Object.fromEntries(Object.entries(films).sort(([, a], [, b]) => a.title.localeCompare(b.title, 'de'))),
    shows,
  };
}

/** JSON mit einer Zeile pro Vorstellung – kompakt und mit gut lesbaren Git-Diffs. */
export function formatProgram(data) {
  const list = (items) => items.map((item) => `    ${JSON.stringify(item)}`).join(',\n');
  const films = Object.entries(data.films)
    .map(([key, film]) => `    ${JSON.stringify(key)}: ${JSON.stringify(film)}`)
    .join(',\n');
  return [
    '{',
    `  "generatedAt": ${JSON.stringify(data.generatedAt)},`,
    `  "days": ${JSON.stringify(data.days)},`,
    `  "cinemas": [\n${list(data.cinemas)}\n  ],`,
    `  "films": {\n${films}\n  },`,
    `  "shows": [\n${list(data.shows)}\n  ]`,
    '}',
    '',
  ].join('\n');
}

async function readPrevious() {
  try {
    return JSON.parse(await readFile(OUT_FILE, 'utf8'));
  } catch {
    return null;
  }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const now = new Date();
  const previous = await readPrevious();
  const data = await collect({ today: berlinDate(now), previous, now });

  const rows = data.cinemas.map((c) => ({
    Kino: c.name,
    Quelle: c.source,
    Status: c.status,
    Vorstellungen: c.shows,
    Hinweis: c.message ?? '',
  }));
  console.table(rows);
  console.log(`${data.shows.length} Vorstellungen, ${Object.keys(data.films).length} Filme (${data.days[0]} bis ${data.days.at(-1)})`);

  const problems = data.cinemas.filter((c) => c.status !== 'ok');
  // Der Workflow läuft stündlich. Damit nicht jede Stunde eine Mail kommt, schlägt er nur Alarm, wenn
  // ein Problem neu ist – und, solange es besteht, einmal am Tag beim Lauf zwischen 18 und 19 Uhr.
  const previousStatus = new Map((previous?.cinemas ?? []).map((c) => [c.id, c.status]));
  const newProblems = problems.filter((c) => (previousStatus.get(c.id) ?? 'ok') === 'ok');
  const alert = newProblems.length > 0 || (problems.length > 0 && berlinTime(now).startsWith('18:'));

  if (process.env.GITHUB_STEP_SUMMARY) {
    const md = [
      `### Kinoprogramm ${data.days[0]} bis ${data.days.at(-1)}`,
      '',
      '| Kino | Quelle | Status | Vorstellungen | Hinweis |',
      '| --- | --- | --- | ---: | --- |',
      ...rows.map((r) => `| ${r.Kino} | ${r.Quelle} | ${r.Status} | ${r.Vorstellungen} | ${r.Hinweis.replace(/\|/g, '/')} |`),
      '',
    ].join('\n');
    await appendFile(process.env.GITHUB_STEP_SUMMARY, md);
  }
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, `problems=${problems.length}\nalert=${alert}\n`);
  }

  if (data.shows.length === 0) {
    throw new Error('Keine einzige Vorstellung gefunden – alte Daten bleiben unverändert.');
  }
  if (dryRun) return;

  await mkdir(dirname(OUT_FILE), { recursive: true });
  await writeFile(OUT_FILE, formatProgram(data));
  console.log(`Geschrieben: ${OUT_FILE}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
