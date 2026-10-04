// iCalendar-Feed (Cineding, WordPress "Events Manager").
import { fetchText } from '../lib/http.js';
import { berlinDate, berlinTime } from '../lib/dates.js';

const unescapeText = (v) =>
  v
    .replace(/\\n/gi, ' ')
    .replace(/\\([,;\\])/g, '$1')
    .trim();

/** "20261008T190000" (Ortszeit) oder "20261008T170000Z" (UTC) → { date, time } */
function parseDateTime(value) {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, , utc] = m;
  if (utc) {
    const instant = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi));
    return { date: berlinDate(instant), time: berlinTime(instant) };
  }
  return { date: `${y}-${mo}-${d}`, time: `${h}:${mi}` };
}

/** Dauer in Minuten aus Beginn und Ende (Cineding trägt oft Ende = Beginn ein → unbekannt). */
function durationOf(start, end) {
  if (!start || !end) return null;
  const minutes = (Date.parse(`${end.date}T${end.time}:00Z`) - Date.parse(`${start.date}T${start.time}:00Z`)) / 60000;
  return minutes >= 30 && minutes <= 400 ? minutes : null;
}

export function parseIcal(text) {
  const lines = text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  const shows = [];
  let event = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') event = {};
    else if (line === 'END:VEVENT') {
      if (event?.start && event.summary) {
        shows.push({
          ...event.start,
          title: event.summary,
          url: event.url ?? null,
          duration: durationOf(event.start, event.end),
          description: event.description ?? null,
        });
      }
      event = null;
    } else if (event) {
      const idx = line.indexOf(':');
      if (idx < 0) continue;
      const name = line.slice(0, idx).split(';')[0].toUpperCase();
      const value = line.slice(idx + 1);
      if (name === 'DTSTART') event.start = parseDateTime(value);
      else if (name === 'DTEND') event.end = parseDateTime(value);
      else if (name === 'SUMMARY') event.summary = unescapeText(value);
      else if (name === 'DESCRIPTION') event.description = unescapeText(value);
      else if (name === 'URL') event.url = value.trim();
    }
  }
  return shows;
}

export async function ical({ url }) {
  return parseIcal(await fetchText(url, { accept: 'text/calendar' }));
}
