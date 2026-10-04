// Cinetixx: Ticketsystem von Kinobar Prager Frühling, Luru Kino und Schaubühne Lindenfels.
import { fetchJson } from '../lib/http.js';
import { versionFromText } from '../lib/normalize.js';

export function parseCinetixx(events, cinemaId) {
  const shows = [];
  for (const ev of events) {
    for (const s of ev.shows ?? []) {
      if (cinemaId && String(s.cinemaId) !== String(cinemaId)) continue;
      // "2026-10-09T21:15:00" – Ortszeit
      const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(s.displayDateTime ?? '');
      if (!m) continue;
      // Sprache z. B. "OmU, Originalversion" oder "D, Deutsch"
      const version = versionFromText(String(s.language ?? ev.language ?? '').split(',')[0]);
      shows.push({
        date: m[1],
        time: m[2],
        title: s.showName || ev.title,
        version,
        extras: ev.is3D ? ['3D'] : [],
        screen: s.auditoriumName || null,
        url: s._UrlBooking ? String(s._UrlBooking).replace(/^http:/, 'https:') : null,
      });
    }
  }
  return shows;
}

export async function cinetixx({ cinemaId }) {
  const events = await fetchJson(`https://booking.cinetixx.de/api/cinemas/events/cinema/${cinemaId}`);
  if (!Array.isArray(events)) throw new Error('Unerwartete Antwort von Cinetixx');
  return parseCinetixx(events, cinemaId);
}
