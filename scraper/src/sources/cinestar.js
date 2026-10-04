// CineStar: öffentliche JSON-API der CineStar-Webseite.
import { fetchJson } from '../lib/http.js';
import { mapLimit } from '../lib/pool.js';

const BASE = 'https://www.cinestar.de';

const localDate = (st) => /^(\d{4}-\d{2}-\d{2})/.exec(st?.datetime ?? '')?.[1];

export function parseCinestar(items, { ticketingLink, durations } = {}) {
  const shows = [];
  for (const item of items) {
    for (const st of item.showtimes ?? []) {
      // "2026-10-07 19:50 CEST" – bereits Ortszeit
      const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/.exec(st.datetime ?? '');
      if (!m) continue;
      const attrs = (st.attributes ?? []).map((a) => String(a).toUpperCase());
      const version = attrs.includes('OMU') ? 'OmU' : attrs.includes('OV') ? 'OV' : null;
      const extras = [];
      if (attrs.includes('3D')) extras.push('3D');
      if (attrs.includes('IMAX')) extras.push('IMAX');
      const url =
        ticketingLink && st.systemId
          ? ticketingLink.replace('%SYSTEM_SESSION_ID%', encodeURIComponent(st.systemId))
          : item.detailLink
            ? BASE + item.detailLink
            : null;
      shows.push({ date: m[1], time: m[2], title: item.title, version, extras, url, duration: durations?.get(item.id) ?? null });
    }
  }
  return shows;
}

export async function cinestar({ cinemaId }, { days = [] } = {}) {
  const [cinemas, items] = await Promise.all([
    fetchJson(`${BASE}/api/cinema/`).catch(() => []),
    fetchJson(`${BASE}/api/cinema/${cinemaId}/show/`),
  ]);
  const cinema = Array.isArray(cinemas) ? cinemas.find((c) => c.id === cinemaId) : null;

  // Die Filmlänge steht nur in den Details – nur für Filme im angezeigten Zeitraum abrufen.
  const relevant = items.filter((item) => (item.showtimes ?? []).some((st) => days.includes(localDate(st))));
  const durations = new Map();
  await mapLimit(relevant, 4, async (item) => {
    try {
      const details = await fetchJson(`${BASE}/api/show/${item.id}`, { retries: 1 });
      if (details?.duration) durations.set(item.id, Number(details.duration));
    } catch {
      /* Filmlänge ist optional */
    }
  });

  return parseCinestar(items, { ticketingLink: cinema?.ticketingLink, durations });
}
