// cineprog.net: Webseiten-System des Regina Palast (kinoleipzig.com) und des City Kinos Buxtehude.
// Klassische Seiten haben das komplette Programm als JSON in "var programm = {...};".
// Das neue "Premium"-Design (Regina Palast seit 29.10.2026) zeigt es nur noch als Tabelle je Film.
import * as cheerio from 'cheerio';
import { fetchText } from '../lib/http.js';
import { versionFromText } from '../lib/normalize.js';

/** Liest das JSON-Objekt, das direkt nach `marker` im Text beginnt. */
export function extractJsonObject(text, marker) {
  const start = text.indexOf('{', text.indexOf(marker));
  if (text.indexOf(marker) < 0 || start < 0) throw new Error(`"${marker}" nicht gefunden`);
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (c === '\\') i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return JSON.parse(text.slice(start, i + 1));
  }
  throw new Error(`JSON nach "${marker}" ist unvollständig`);
}

// Leere Felder kommen als {} – gesetzte Merkmale als "1" o. ä.
const isSet = (v) => v !== undefined && v !== null && v !== '' && !(typeof v === 'object' && Object.keys(v).length === 0);

export function parseCineprog(html, pageUrl) {
  if (!html.includes('var programm =') && html.includes('data-program-list')) return parsePremium(html, pageUrl);
  const programm = extractJsonObject(html, 'var programm =');
  const shows = [];
  for (const film of Object.values(programm.filme ?? {})) {
    const facts = film.filmfakten ?? {};
    const showFacts = film.vorstellungen?.vorstellungen_fakten ?? {};
    const title = String(facts.titel ?? '').trim();
    if (!title) continue;
    const version =
      isSet(facts.OmitU) || isSet(showFacts.OmitU) ? 'OmU' : isSet(facts.OrigVersion) || isSet(showFacts.OrigVersion) ? 'OV' : null;
    const extras = isSet(showFacts.DreiD) ? ['3D'] : [];
    const duration = Number(facts.laufzeit) || null;
    const description = typeof facts.inhalt === 'string' ? facts.inhalt : null;
    const termine = film.vorstellungen?.termine ?? {};
    for (const entry of Object.values(termine)) {
      for (const t of [].concat(entry)) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(t?.datum ?? '') || !/^\d{1,2}:\d{2}$/.test(t?.zeit ?? '')) continue;
        shows.push({
          date: t.datum,
          time: t.zeit.padStart(5, '0'),
          title,
          version,
          extras,
          duration,
          description,
          screen: typeof t.saal_bezeichnung === 'string' ? t.saal_bezeichnung : null,
          url: typeof t.link_fixticket === 'string' && t.link_fixticket.startsWith('http') ? t.link_fixticket : null,
        });
      }
    }
  }
  return shows;
}

/** Premium-Design: je Film eine Karte, je Fassung eine Tabellenzeile ("2D · OV"), je Termin ein Zeit-Knopf. */
function parsePremium(html, pageUrl) {
  const $ = cheerio.load(html);
  const text = (el) => $(el).text().replace(/\s+/g, ' ').trim();
  const shows = [];
  $('[data-program-list] article[data-movie-id]').each((_, card) => {
    const $card = $(card);
    const title = text($card.find('h3').first());
    if (!title) return;
    const pills = $card.find('.pill').map((_, el) => text(el)).get();
    const duration = Number(pills.map((p) => /^(\d+)\s*Min/.exec(p)?.[1]).find(Boolean)) || null;
    const description = text($card.find('h3').first().next('p')) || null;
    $card.find('tbody tr').each((_, row) => {
      const label = text($(row).find('th').first()); // z. B. "Spielzeiten 2D · OmU"
      const version = versionFromText(label);
      const extras = /\b3D\b/.test(label) ? ['3D'] : [];
      $(row)
        .find('a.btn-time')
        .each((_, link) => {
          const date = $(link).attr('data-date') ?? '';
          const time = $(link).attr('data-time') ?? '';
          if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{1,2}:\d{2}$/.test(time)) return;
          const href = $(link).attr('href');
          shows.push({
            date,
            time: time.padStart(5, '0'),
            title,
            version,
            extras,
            duration,
            description,
            url: href && pageUrl ? new URL(href, pageUrl).href : null,
          });
        });
    });
  });
  return shows;
}

export async function cineprog({ url }) {
  // kinoleipzig.com nimmt Verbindungen von GitHubs Servern ab und zu nicht an (Connect-Timeout) –
  // deshalb mehr Geduld: bis zu 3 Wiederholungen nach 10, 20 und 40 Sekunden.
  return parseCineprog(await fetchText(url, { retries: 3, retryDelayMs: 10_000 }), url);
}
