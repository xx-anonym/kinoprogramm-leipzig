// Passage Kinos: Terminliste auf passage-kinos.de/termine.
import * as cheerio from 'cheerio';
import { fetchText } from '../lib/http.js';

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
    shows.push({
      date: `${m[3]}-${m[2]}-${m[1]}`,
      time: `${m[4]}:${m[5]}`,
      title,
      version: omu ? 'OmU' : null,
      screen: screen || null,
      url: href ? new URL(href, BASE).href : null,
    });
  });
  return shows;
}

export async function passage() {
  return parsePassage(await fetchText(`${BASE}termine`));
}
