// CineStar: öffentliche JSON-API der CineStar-Webseite.
import { fetchJson } from '../lib/http.js';

const BASE = 'https://www.cinestar.de';

export function parseCinestar(items, { ticketingLink } = {}) {
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
      shows.push({ date: m[1], time: m[2], title: item.title, version, extras, url });
    }
  }
  return shows;
}

export async function cinestar({ cinemaId }) {
  const [cinemas, items] = await Promise.all([
    fetchJson(`${BASE}/api/cinema/`).catch(() => []),
    fetchJson(`${BASE}/api/cinema/${cinemaId}/show/`),
  ]);
  const cinema = Array.isArray(cinemas) ? cinemas.find((c) => c.id === cinemaId) : null;
  return parseCinestar(items, { ticketingLink: cinema?.ticketingLink });
}
