// kino-zeit.de: Kinoportal. Die Kinoseiten enthalten das Programm der nächsten 7 Tage als
// strukturierte Daten (JSON-LD "MovieTheater" mit einer Liste von "Event"s).
// Dient als Ergänzung, wenn die eigentliche Quelle eine neue Woche erst später bekommt.
import * as cheerio from 'cheerio';

import { fetchText } from '../lib/http.js';

const ENTITIES = { amp: '&', quot: '"', apos: "'", nbsp: ' ', lt: '<', gt: '>' };
const decode = (text) =>
  String(text ?? '')
    .replace(/&(#\d+|[a-z]+);/gi, (m, e) => (e[0] === '#' ? String.fromCharCode(Number(e.slice(1))) : (ENTITIES[e.toLowerCase()] ?? m)))
    .trim();

export function parseKinozeit(html) {
  const $ = cheerio.load(html);
  let theater = null;
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).text());
      if (data?.['@type'] === 'MovieTheater') theater = data;
    } catch {
      // andere, kaputte JSON-LD-Blöcke ignorieren
    }
  });
  if (!theater) throw new Error('kino-zeit: kein Kinoprogramm (JSON-LD) gefunden');
  const shows = [];
  for (const event of [].concat(theater.event ?? [])) {
    // "2026-10-08T16:45:00" – Ortszeit ohne Offset
    const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(event?.startDate ?? '');
    const title = decode(event?.name);
    if (!m || !title) continue;
    shows.push({ date: m[1], time: m[2], title, description: decode(event.description) || null });
  }
  return shows;
}

export async function kinozeit({ url }) {
  return parseKinozeit(await fetchText(url));
}
