// Schauburg: Wochenprogramm auf schauburg-leipzig.de.
// Datum und Uhrzeit stehen nur beim ersten Eintrag einer Gruppe und gelten für die folgenden mit.
import * as cheerio from 'cheerio';
import { fetchText } from '../lib/http.js';
import { parseGermanDate, parseTime } from '../lib/dates.js';

const BASE = 'https://www.schauburg-leipzig.de/';

export function parseSchauburg(html, referenceDate) {
  const $ = cheerio.load(html);
  const shows = [];
  let date = null;
  let time = null;
  $('.program-list-total')
    .first()
    .find('.item')
    .each((_, item) => {
      const $item = $(item);
      const dateText = $item.find('p.date').first().text().trim();
      const timeText = $item.find('p.time').first().text().trim();
      if (dateText) {
        date = parseGermanDate(dateText, referenceDate);
        time = null;
      }
      if (timeText) time = parseTime(timeText);
      const link = $item.find('.title h2 a').first();
      const title = (link.length ? link : $item.find('.title h2').first()).text().replace(/\s+/g, ' ').trim();
      if (!date || !time || !title) return;
      const href = link.attr('href');
      const duration = Number(/Laufzeit:\s*(\d+)/.exec($item.find('p.meta').text())?.[1]) || null;
      shows.push({ date, time, title, duration, url: href ? new URL(href, BASE).href : null });
    });
  return shows;
}

export async function schauburg(_config, { today }) {
  return parseSchauburg(await fetchText(`${BASE}wochenprogramm`), today);
}
