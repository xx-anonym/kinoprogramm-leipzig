// IMDb-Bewertungen für die Filme beider Städte.
//
// Quelle sind die offiziellen IMDb-Datensätze für persönliche, nicht-kommerzielle Nutzung
// (https://developer.imdb.com/non-commercial-datasets/) – "Information courtesy of IMDb
// (https://www.imdb.com). Used with permission." Die Kinos liefern meist deutsche Titel; zugeordnet
// wird über die deutschen Verleihtitel (title.akas), Originaltitel, Jahr und Laufzeit. Lieber keine
// Bewertung als eine falsche: Zugeordnet wird nur bei exakt gleichem Titel und passenden Eckdaten.
//
//   node src/imdb.js   # neue Filme zuordnen (lädt dann ~750 MB), Bewertungen täglich auffrischen
//
// Ergebnis ist scraper/data/imdb.json; der Scraper übernimmt daraus die Bewertungen in program.json.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { createInterface } from 'node:readline';
import { createGunzip } from 'node:zlib';
import { fileURLToPath } from 'node:url';

import { CITIES } from './cities/index.js';
import { filmKey } from './lib/normalize.js';

export const CACHE_FILE = fileURLToPath(new URL('../data/imdb.json', import.meta.url));
const DATASETS = 'https://datasets.imdbws.com';
const USER_AGENT = 'Mozilla/5.0 (compatible; kinoprogramm-leipzig/1.0; +https://github.com/xx-anonym/kinoprogramm-leipzig)';

/** Ab so vielen Stimmen zeigt die Seite die Bewertung (darunter ist sie zu zufällig). */
export const MIN_VOTES = 25;
const DAY = 24 * 3600 * 1000;
const RATINGS_MAX_AGE = 20 * 3600 * 1000; // Bewertungen etwa einmal am Tag auffrischen
const RETRY_AFTER = 7 * DAY; // nicht gefundene Filme (oft noch ohne deutschen Titel bei IMDb) erneut versuchen …
const MAX_ATTEMPTS = 4; // … aber nicht ewig
const FORGET_AFTER = 60 * DAY; // Filme, die lange nicht mehr laufen, aus dem Zwischenspeicher entfernen

const MOVIE_TYPES = new Set(['movie', 'tvMovie', 'video', 'tvSpecial']);
const IMDB_REGIONS = new Set(['DE', 'AT', 'CH', 'XWW']);

// Keine Filme im engeren Sinn – hier gibt es keine (sinnvolle) IMDb-Bewertung
// (ganze Wörter für Englisches, Wortstämme für deutsche Zusammensetzungen wie "Überraschungspremiere")
const EVENT =
  /\b(sneak|preview|opera|oper|ballet|concert|festival|vortrag|lesung)\b|überraschung|kurzfilm|shortfilm|short film|ballett|konzert|theaterveranstaltung|preisverleihung|live aus der met|\(met\b|\bmet\s+(20\d\d|opera)/i;
// Opernübertragungen: "Verdi: Macbeth", "Macbeth - Verdi (MET …)", "Live aus der MET: Wagner: Parsifal"
const COMPOSER = /\b(verdi|wagner|puccini|mozart|rossini|donizetti|bizet|strauss|händel|tschaikowsky|tchaikovsky|gounod|massenet)\b/i;
export const isEvent = (title) => EVENT.test(title) || (COMPOSER.test(title) && /\bmet\b|^[^:]+:\s|\s[-–]\s/i.test(title));

/**
 * Suchschlüssel eines Films: der Titel der Kinos, der Originaltitel (von kinoheld, nicht immer
 * verlässlich) und – nur als Notlösung – der Haupttitel vor " – " bzw. ":".
 */
export function queryKeys(film) {
  const key = (t) => (t ? filmKey(t) : '');
  const title = new Set([key(film.title)].filter((k) => k.length >= 2));
  const original = new Set([key(film.original)].filter((k) => k.length >= 2 && !title.has(k)));
  const main = new Set();
  for (const t of [film.title, film.original].filter(Boolean)) {
    const m = /^(.{2,}?)\s+[-–:]\s+.+$/.exec(t) ?? /^(.{2,}?):\s+.+$/.exec(t);
    const k = m ? key(m[1]) : '';
    if (k.length >= 4 && !title.has(k) && !original.has(k)) main.add(k);
  }
  return { title, original, main };
}

/**
 * Wählt aus den IMDb-Titeln mit gleichem Namen den passenden – oder keinen.
 * candidates: [{ id, year, runtime, votes, via: 'title' | 'original' | 'main' }]
 */
export function pickCandidate(film, candidates, { currentYear }) {
  const near = (a, b, d) => a != null && b != null && Math.abs(a - b) <= d;
  const year = film.year >= 1900 && film.year <= currentYear + 1 ? film.year : null;
  const fitsRuntime = (c) => !(film.duration && c.runtime && Math.abs(c.runtime - film.duration) > 30);
  const allowed = (c) => {
    // Nur der Haupttitel stimmt: Jahr und Laufzeit müssen passen, soweit bekannt
    if (c.via === 'main') {
      return (year || film.duration) && (!year || near(c.year, year, 1)) && (!film.duration || near(c.runtime, film.duration, 10));
    }
    // Nur der Originaltitel von kinoheld stimmt (der ist manchmal falsch): ein alter, wenig bekannter
    // Film ist dann eher eine Verwechslung – außer das Jahr passt
    if (c.via === 'original' && !near(c.year, year, 2) && c.year < currentYear - 5 && (c.votes ?? 0) < 2500) return false;
    return true;
  };
  const usable = candidates.filter((c) => fitsRuntime(c) && allowed(c));

  const runtimeFit = (c) => (film.duration && c.runtime ? Math.max(0, 10 - Math.abs(c.runtime - film.duration)) / 5 : 0);
  const score = (c) =>
    (year && c.year ? 3 - Math.abs(c.year - year) : c.year >= currentYear - 1 ? 2 : 0) +
    runtimeFit(c) +
    (c.via === 'main' ? 0 : 2) +
    Math.log10((c.votes ?? 0) + 1) / 2;
  const best = (list) => [...list].sort((a, b) => score(b) - score(a))[0] ?? null;

  // Jahr passt (±2) – das Jahr der Kinos ist manchmal das der deutschen (Wieder-)Aufführung
  const sameEra = usable.filter((c) => !year || near(c.year, year, 2));
  if (sameEra.length) return best(sameEra);
  // Sonst nur bei klarer Lage: Laufzeit passt, oder es gibt genau einen bekannten Film dieses Namens
  const sure = usable.filter((c) => near(c.runtime, film.duration, 10));
  if (sure.length) return best(sure);
  if (usable.length === 1 && usable[0].votes >= 1000) return usable[0];
  return null;
}

/**
 * Aktualisiert den Zwischenspeicher: ordnet neue Filme zu und frischt Bewertungen auf.
 * Die beiden Lader sind injizierbar (Tests ohne Netz):
 *   loadRatings() → Map(id → { rating, votes })
 *   findCandidates(films) → Map(key → [{ id, year, runtime, votes, via }])
 */
export async function refreshImdb({ films, cache, now = new Date(), loadRatings, findCandidates, log = () => {} }) {
  const entries = { ...(cache?.films ?? {}) };
  const today = now.toISOString().slice(0, 10);
  const currentYear = Number(today.slice(0, 4));
  const age = (iso) => (iso ? now - new Date(iso) : Infinity);

  for (const film of films) if (entries[film.key]) entries[film.key] = { ...entries[film.key], seen: today };
  for (const [key, entry] of Object.entries(entries)) if (age(entry.seen) > FORGET_AFTER) delete entries[key];

  const todo = films.filter((film) => {
    const entry = entries[film.key];
    if (!entry) return true;
    return !entry.id && !entry.skip && (entry.attempts ?? 1) < MAX_ATTEMPTS && age(entry.checked) > RETRY_AFTER;
  });
  for (const film of todo.filter((f) => isEvent(f.title))) {
    entries[film.key] = { id: null, skip: true, title: film.title, seen: today };
  }
  const lookup = todo.filter((f) => !isEvent(f.title));

  let matched = 0;
  if (lookup.length) {
    log(`IMDb: ${lookup.length} Film(e) zuordnen …`);
    const candidates = await findCandidates(lookup);
    for (const film of lookup) {
      const hit = pickCandidate(film, candidates.get(film.key) ?? [], { currentYear });
      const attempts = (entries[film.key]?.attempts ?? 0) + 1;
      entries[film.key] = hit
        ? { id: hit.id, title: film.title, seen: today }
        : { id: null, title: film.title, checked: today, attempts, seen: today };
      if (hit) matched++;
    }
    log(`IMDb: ${matched} von ${lookup.length} zugeordnet`);
  }

  let ratingsUpdated = cache?.ratingsUpdated ?? null;
  if (matched > 0 || age(ratingsUpdated) > RATINGS_MAX_AGE) {
    const ratings = await loadRatings();
    for (const entry of Object.values(entries)) {
      if (!entry.id) continue;
      const r = ratings.get(entry.id);
      entry.rating = r?.rating ?? null;
      entry.votes = r?.votes ?? 0;
    }
    ratingsUpdated = now.toISOString();
  }
  const sorted = Object.fromEntries(Object.entries(entries).sort(([a], [b]) => a.localeCompare(b)));
  return { ratingsUpdated, films: sorted };
}

/** Bewertungen für program.json: key → { id, rating, votes } (nur mit genug Stimmen). */
export function ratingsForProgram(cache) {
  const result = new Map();
  for (const [key, entry] of Object.entries(cache?.films ?? {})) {
    if (entry.id && entry.rating && entry.votes >= MIN_VOTES) result.set(key, { id: entry.id, rating: entry.rating, votes: entry.votes });
  }
  return result;
}

// --- IMDb-Datensätze lesen ---

async function eachRow(file, onRow) {
  const res = await fetch(`${DATASETS}/${file}`, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`HTTP ${res.status} für ${file}`);
  const lines = createInterface({ input: Readable.fromWeb(res.body).pipe(createGunzip()), crlfDelay: Infinity });
  let header = true;
  for await (const line of lines) {
    if (header) header = false;
    else onRow(line.split('\t'));
  }
}

const num = (v) => (v && v !== '\\N' ? Number(v) : null);

export async function loadRatings() {
  const ratings = new Map();
  await eachRow('title.ratings.tsv.gz', ([id, rating, votes]) => ratings.set(id, { rating: Number(rating), votes: Number(votes) }));
  return ratings;
}

/** Sucht in title.basics und title.akas nach Filmen mit den gesuchten Titeln. */
export async function findCandidates(films) {
  const wanted = new Map(); // Schlüssel → [{ key, via }]
  for (const film of films) {
    const keys = queryKeys(film);
    for (const via of ['title', 'original', 'main']) {
      for (const k of keys[via]) wanted.set(k, [...(wanted.get(k) ?? []), { key: film.key, via }]);
    }
  }
  const rank = { title: 3, original: 2, main: 1 };
  const hits = new Map(); // film key → Map(id → via), die stärkste Übereinstimmung zählt
  const note = (titleKey, id) => {
    for (const { key, via } of wanted.get(titleKey) ?? []) {
      const ids = hits.get(key) ?? new Map();
      if (!ids.has(id) || rank[via] > rank[ids.get(id)]) ids.set(id, via);
      hits.set(key, ids);
    }
  };

  const ratings = await loadRatings();
  const movies = new Map(); // id → { year, runtime }
  await eachRow('title.basics.tsv.gz', ([id, type, primary, original, , year, , runtime]) => {
    if (!MOVIE_TYPES.has(type) || !ratings.has(id)) return;
    movies.set(id, { year: num(year), runtime: num(runtime) });
    note(filmKey(primary), id);
    if (original !== primary) note(filmKey(original), id);
  });
  await eachRow('title.akas.tsv.gz', ([id, , title, region, , , , isOriginal]) => {
    if ((IMDB_REGIONS.has(region) || isOriginal === '1') && movies.has(id)) note(filmKey(title), id);
  });

  const result = new Map();
  for (const [key, ids] of hits) {
    result.set(
      key,
      [...ids].map(([id, via]) => ({ id, via, ...movies.get(id), votes: ratings.get(id)?.votes ?? 0 })),
    );
  }
  return result;
}

// --- Programm ---

export async function readCache(file = CACHE_FILE) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

/** Alle Filme aus den Programmen der Städte (mit Originaltitel, Jahr und Laufzeit als Hinweis). */
async function currentFilms() {
  const films = new Map();
  for (const city of Object.values(CITIES)) {
    const program = await readCache(join(city.siteDir, 'data', 'program.json'));
    for (const [key, f] of Object.entries(program?.films ?? {})) {
      if (!films.has(key)) films.set(key, { key, title: f.title, original: f.original, year: f.year, duration: f.duration });
    }
  }
  return [...films.values()];
}

async function main() {
  const started = Date.now();
  const cache = await readCache();
  const updated = await refreshImdb({
    films: await currentFilms(),
    cache,
    loadRatings,
    findCandidates,
    log: console.log,
  });
  if (JSON.stringify(updated) !== JSON.stringify(cache)) {
    await mkdir(dirname(CACHE_FILE), { recursive: true });
    await writeFile(CACHE_FILE, `${JSON.stringify(updated, null, 1)}\n`);
    console.log(`Geschrieben: ${CACHE_FILE}`);
  } else console.log('IMDb: nichts zu tun.');
  const known = Object.values(updated.films).filter((e) => e.id).length;
  console.log(`IMDb: ${known} von ${Object.keys(updated.films).length} Filmen zugeordnet (${Math.round((Date.now() - started) / 1000)} s)`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
