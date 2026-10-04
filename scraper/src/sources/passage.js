// Passage Kinos: Terminliste auf passage-kinos.de/termine.
import * as cheerio from 'cheerio';
import { fetchText } from '../lib/http.js';
import { mapLimit } from '../lib/pool.js';

const BASE = 'https://www.passage-kinos.de/';

export function parsePassage(html) {
  const $ = cheerio.load(html);
  const shows = [];
  $('.timetable-border-bottom').each((_, row) => {
    const $row = $(row);
    // <time datetime="05.10.2026 13:30:00">
    const dt = $row.find('time.film-dates-day-time').attr('datetime') ?? '';
    const m = /(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})/.exec(dt);
    if (!m) return;
    const link = $row.find('a.block').first();
    const title = link.text().trim();
    if (!title) return;
    const href = link.attr('href');
    // Saalname steht als Text vor dem Ticket-Icon
    const screen = $row
      .find('.open-ticket')
      .parent()
      .contents()
      .filter((_, n) => n.type === 'text')
      .text()
      .trim();
    const omu = $row.find('[data-tooltip="Original mit Untertiteln"]').length > 0;
    const description = link.siblings('span').first().text().replace(/\s+/g, ' ').trim();
    shows.push({
      date: `${m[3]}-${m[2]}-${m[1]}`,
      time: `${m[4]}:${m[5]}`,
      title,
      version: omu ? 'OmU' : null,
      screen: screen || null,
      url: href ? new URL(href, BASE).href : null,
      description: description || null,
    });
  });
  return shows;
}

/** Filmseite: "… FSK ab 0 Länge 82 Min. …" → 82 */
export function parsePassageDuration(html) {
  const text = cheerio.load(html)('body').text().replace(/\s+/g, ' ');
  const m = /Länge\s*:?\s*(\d{2,3})\s*Min/i.exec(text);
  return m ? Number(m[1]) : null;
}

export async function passage(_config, { days = [] } = {}) {
  const shows = parsePassage(await fetchText(`${BASE}termine`));
  // Die Filmlänge steht nur auf den Filmseiten – nur für Filme im angezeigten Zeitraum abrufen.
  const urls = [...new Set(shows.filter((s) => days.includes(s.date) && s.url).map((s) => s.url))];
  const durations = new Map();
  await mapLimit(urls, 3, async (url) => {
    try {
      const duration = parsePassageDuration(await fetchText(url, { retries: 1 }));
      if (duration) durations.set(url, duration);
    } catch {
      /* Filmlänge ist optional */
    }
  });
  return shows.map((s) => ({ ...s, duration: durations.get(s.url) ?? null }));
}
