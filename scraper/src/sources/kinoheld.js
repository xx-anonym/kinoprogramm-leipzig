// kinoheld: Ticketportal. Viele Kinos verkaufen direkt darüber (fast alle Hamburger Programmkinos),
// andere sind mit Programm und Link zu ihrem eigenen Ticketshop gelistet (Cineplex, UCI, CinemaxX).
// cineplex.de und uci-kinowelt.de selbst blockieren automatische Abrufe (Cloudflare).
import { fetchText } from '../lib/http.js';
import { versionFromText } from '../lib/normalize.js';

const GRAPHQL_URL = 'https://next-live.kinoheld.de/graphql';

const QUERY = `query Shows($cinemaId: ID) {
  cinema(id: $cinemaId) { urlSlug city { urlSlug } }
  shows(cinemaId: $cinemaId, excludeExpired: true, limit: 500) {
    data {
      name
      beginning
      urlSlug
      deeplink
      audioLanguage { isocode }
      subtitleLanguage { isocode }
      flags { code category }
      movie { title duration shortDescription }
    }
  }
}`;

function versionOf(show) {
  const audio = show.audioLanguage?.isocode?.toLowerCase();
  const subtitles = show.subtitleLanguage?.isocode?.toLowerCase();
  if (subtitles === 'de' && audio && audio !== 'de') return 'OmU';
  if (subtitles === 'en' && audio && audio !== 'en') return 'OmeU';
  if (audio && audio !== 'de' && !subtitles) return 'OV';
  for (const flag of show.flags ?? []) {
    if (flag?.category === 'LANGUAGE') {
      const v = versionFromText(flag.code);
      if (v) return v;
    }
  }
  return null;
}

export function parseKinoheld(response) {
  if (response?.errors?.length) throw new Error(`kinoheld: ${response.errors[0].message}`);
  const list = response?.data?.shows?.data;
  if (!Array.isArray(list)) throw new Error('Unerwartete Antwort von kinoheld');
  // Kinos, die direkt über kinoheld verkaufen, haben keinen "deeplink" – dann führt der Link auf die
  // Vorstellung bei kinoheld: /kino/<stadt>/<kino>/vorstellung/<vorstellung>
  const cinema = response.data.cinema;
  const showPage =
    cinema?.urlSlug && cinema?.city?.urlSlug
      ? (slug) => `https://www.kinoheld.de/kino/${cinema.city.urlSlug}/${cinema.urlSlug}/vorstellung/${encodeURIComponent(slug)}`
      : null;
  const shows = [];
  for (const show of list) {
    // "2026-10-05T14:30:00+02:00" – Ortszeit mit Offset
    const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(show.beginning ?? '');
    const title = (show.name || show.movie?.title || '').trim();
    if (!m || !title) continue;
    const codes = (show.flags ?? []).map((f) => String(f?.code ?? '').toLowerCase());
    shows.push({
      date: m[1],
      time: m[2],
      title,
      version: versionOf(show),
      extras: codes.includes('3d') ? ['3D'] : [],
      url: show.deeplink || (showPage && show.urlSlug ? showPage(show.urlSlug) : null),
      duration: Number(show.movie?.duration) || null,
      description: show.movie?.shortDescription || null,
    });
  }
  return shows;
}

export async function kinoheld({ cinemaId }) {
  const text = await fetchText(GRAPHQL_URL, {
    method: 'POST',
    accept: 'application/json',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: QUERY, variables: { cinemaId: String(cinemaId) } }),
  });
  return parseKinoheld(JSON.parse(text));
}
