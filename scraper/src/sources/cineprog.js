// cineprog.net: Webseiten-System des Regina Palast (kinoleipzig.com).
// Das komplette Programm steckt als JSON in "var programm = {...};".
import { fetchText } from '../lib/http.js';

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

export function parseCineprog(html) {
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
          screen: typeof t.saal_bezeichnung === 'string' ? t.saal_bezeichnung : null,
          url: typeof t.link_fixticket === 'string' && t.link_fixticket.startsWith('http') ? t.link_fixticket : null,
        });
      }
    }
  }
  return shows;
}

export async function cineprog({ url }) {
  return parseCineprog(await fetchText(url));
}
