// Vereinheitlicht Filmtitel und Sprachfassungen über alle Kinos hinweg.

const VERSION_RANK = { OmU: 3, OmeU: 2, OV: 1 };

/** Ordnet eine Fassungsangabe (z. B. "OmU, Originalversion", "OmdU", "engl. OmU") einer festen Bezeichnung zu. */
export function versionFromText(text) {
  if (!text) return null;
  const t = String(text).toLowerCase().replace(/\s+/g, ' ').trim();
  if (/\bom\s?(e|eng|engl|englisch)\.?\s?u\b|\bomu\s*engl|\bomeu\b|\bomengu\b|\bomenglu\b|\bengl(isch)?\.? (om)?u(t|ntertitel)?\b/.test(t)) {
    return 'OmeU';
  }
  if (/\bom\s?(d|dt|deutsch)?\.?\s?u\b|\bomdu\b|\bo\.m\.u\.?|original mit (deutschen )?untertiteln/.test(t)) {
    return 'OmU';
  }
  if (/^(ov|of)\b|\bov\b|\boriginal(version|fassung)?\b(?!.*untertitel)/.test(t)) return 'OV';
  return null;
}

/** Wählt die aussagekräftigere von zwei Fassungen (OmU > OmeU > OV). */
export function pickVersion(...versions) {
  let best = null;
  for (const v of versions) {
    if (v && (!best || VERSION_RANK[v] > VERSION_RANK[best])) best = v;
  }
  return best;
}

const PAREN_TAG =
  /\s*[([]\s*(?:in\s+)?((?:engl\.?\s*)?(?:OmU|OmdU|OmeU|OmengU|OmenglU|OV|OF|OmU engl\.?|dt\.?|DF|deutsch|3D|2D)(?:\s*,[^)\]]*)?)\s*[)\]]/gi;
const TRAILING_TAG = /\s*(?:[-–|]\s*|\bin\s+)?\b(OmU|OmdU|OmeU|OmengU|OV|3D)\s*$/i;
// z. B. "Digger (in OmdU) im engl. Original m.d. Untertitel!"
const TRAILING_ORIGINAL = /\s+im\s+(?:[a-zäöü]+\.?\s+)?Original\b[^()]*$/i;
const TRAILING_YEAR = /\s*\(\s*(?:19|20)\d{2}\s*\)\s*$/;

/**
 * Zerlegt einen Titel wie "GENTLE MONSTER (OmeU)" oder "Digger in OmdU"
 * in Titel, Fassung und Zusatzmerkmale (3D).
 */
export function parseTitle(raw) {
  let title = String(raw ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  const versions = [];
  const extras = new Set();

  const take = (tag) => {
    if (/^3d$/i.test(tag)) extras.add('3D');
    else if (/^2d$/i.test(tag)) return;
    else versions.push(versionFromText(tag));
  };

  title = title.replace(TRAILING_ORIGINAL, (phrase) => {
    versions.push(/untertitel/i.test(phrase) ? 'OmU' : 'OV');
    return '';
  });
  title = title.replace(PAREN_TAG, (_, tag) => {
    take(tag.trim());
    return ' ';
  });
  title = title.replace(TRAILING_YEAR, '');
  let m;
  while ((m = TRAILING_TAG.exec(title))) {
    take(m[1]);
    title = title.slice(0, m.index);
  }
  title = title
    .replace(/\s+([,:])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .replace(/[\s\-–:,]+$/, '')
    .trim();

  return { title, version: pickVersion(...versions), extras: [...extras] };
}

/** Schlüssel zum Zusammenführen gleicher Filme ("Coyote vs. ACME" == "Coyote vs Acme"). */
export function filmKey(title) {
  return String(title)
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\(\s*(19|20)\d{2}\s*\)\s*$/, '')
    .replace(/&/g, 'und')
    .replace(/[^a-z0-9]+/g, '');
}

const isAllCaps = (s) => /[A-ZÄÖÜ]/.test(s) && !/[a-zäöüß]/.test(s);

/**
 * Bestimmt pro Film einen Anzeigetitel: bevorzugt die häufigste Schreibweise
 * in normaler Groß-/Kleinschreibung statt "VERSALIEN".
 */
export function chooseDisplayTitles(titles) {
  const groups = new Map();
  for (const t of titles) {
    const key = filmKey(t);
    if (!groups.has(key)) groups.set(key, new Map());
    const counts = groups.get(key);
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  const display = new Map();
  for (const [key, counts] of groups) {
    const ranked = [...counts.entries()].sort((a, b) => {
      const capsA = isAllCaps(a[0]) ? 1 : 0;
      const capsB = isAllCaps(b[0]) ? 1 : 0;
      return capsA - capsB || b[1] - a[1] || a[0].length - b[0].length || a[0].localeCompare(b[0]);
    });
    display.set(key, ranked[0][0]);
  }
  return display;
}
