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

// Veranstaltungs-Vorsätze vor dem Doppelpunkt, z. B. "Premiere: ALTE LIEBE" oder "Reihe Zeitlos: HARD BOILED".
// Sneak-Previews bleiben unangetastet – dort ist der Vorsatz der eigentliche Titel.
const EVENT_PREFIX =
  /\b(premiere|special|spezial|cinespecial|screening|reihe|preview|kurzfilm|ladies night|trifft film|klassiker|halloween)\b/i;
const QUOTE = /["„“”‚‘’«»]/;
const QUOTES = new RegExp(QUOTE.source, 'g');
const EVENT_SUFFIX = /\s+[-–]\s+(Best of Cinema)\s*$/i;
const TALK_SUFFIX = /\s+\+\s+((?:Film|Publikums)?gespräch|Q&A|Einführung|Diskussion|Vortrag|Gäste?|Regisseur)(.*)$/i;

/**
 * Trennt den eigentlichen Filmtitel von Veranstaltungs-Zusätzen:
 * „Literatur trifft Film": DIE BLECHTROMMEL → { title: 'DIE BLECHTROMMEL', label: 'Literatur trifft Film' }
 * Pans Labyrinth - Best of Cinema → { title: 'Pans Labyrinth', label: 'Best of Cinema' }
 * ANSTATT BÄUMEN + Filmgespräch mit … → { title: 'ANSTATT BÄUMEN', label: '+ Filmgespräch mit …' }
 */
export function splitEvent(raw) {
  let title = String(raw ?? '').trim();
  const labels = [];
  const prefix = /^(.+?):\s+(.+)$/.exec(title);
  if (prefix && (QUOTE.test(prefix[1]) || EVENT_PREFIX.test(prefix[1]))) {
    labels.push(prefix[1].replace(QUOTES, '').trim());
    title = prefix[2];
  }
  const suffix = EVENT_SUFFIX.exec(title);
  if (suffix) {
    labels.push(suffix[1]);
    title = title.slice(0, suffix.index);
  }
  const talk = TALK_SUFFIX.exec(title);
  if (talk) {
    labels.push(`+ ${talk[1]}${talk[2]}`.trim());
    title = title.slice(0, talk.index);
  }
  title = title.replace(QUOTES, '').trim();
  if (!title) return { title: String(raw ?? '').trim(), label: null };
  return { title, label: labels.join(' · ') || null };
}

/** Schlüssel zum Zusammenführen gleicher Filme ("Coyote vs. ACME" == "Coyote vs Acme", "Der Spaziergang …" == "Spaziergang …"). */
export function filmKey(title) {
  return String(title)
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\(\s*(19|20)\d{2}\s*\)\s*$/, '')
    .replace(/^\s*(der|die|das|the)\s+/, '')
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

// ---------- Versalien-Titel ("ALTE LIEBE") in normale Schreibweise bringen ----------

const WORD = /[A-Za-zÀ-ÖØ-öø-ÿ]+(?:['’][A-Za-zÀ-ÖØ-öø-ÿ]+)?/g;

// Häufige deutsche Wörter, die klein geschrieben werden – Grundstock, ergänzt durch die Beschreibungstexte
const GERMAN_LOWER = new Set(
  `und oder aber doch denn sondern für von vom mit ohne im in ins am an ans auf aus bei beim nach über unter vor
  hinter neben zwischen zu zum zur durch gegen um bis seit während wegen trotz anstatt statt der die das den dem des
  ein eine einer einem einen eines kein keine keiner wie als ist sind war waren wird werden wurde sein bin bist hat
  haben hatte hatten habe kann können muss müssen will wollen soll darf wir ich du er sie es ihr uns euch mich dich
  sich mir dir ihm ihn ihnen mein meine dein deine sein seine unser unsere nicht noch nur so auch schon immer nie
  nichts alles alle viele vielen wenig was wer wen wem wo wann warum wohin woher dass ob wenn weil damit man mal hier
  dort jetzt sehr ganz gar zurück weg los ab zusammen allein wieder einfach anders fast bald normal neu neue neuen
  alt alte alten gut gute guten schlecht groß große großen klein kleine kleinen lang lange kurz schön schöne wild
  frei ewig jung junge jungen letzte letzten erste ersten halb voll leer schwarz weiß rot blau grün hell dunkel heiß
  kalt laut leise wahr falsch echt fremd fern nah weit hoch tief offen geheim verrückt verloren`.split(/\s+/),
);

const ENGLISH_SMALL = new Set('a an and as at but by for in nor of on or the to up vs via'.split(' '));
const ENGLISH_MARKERS = new Set(
  "the of and a to for at on with is are you your my me we our all it its this that from by don't i'm can't love".split(' '),
);
const GERMAN_MARKERS = new Set(
  'der die das und für von vom mit im ins zum zur ein eine wie was wir ist nicht auf aus bei nach über unter vor zu ich du'.split(' '),
);
const ACRONYMS = new Set('DDR BRD USA UK EU NSU RAF MET UFA DEFA ARD ZDF MDR FBI CIA KGB NYC LGBTQ DJ TV OV OMU'.split(' '));
const ROMAN = /^(?=[IVXLC])M*(C[MD]|D?C{0,3})(X[CL]|L?X{0,3})(I[XV]|V?I{0,3})$/;

/**
 * Zählt in normal geschriebenen Texten, wie oft ein Wort klein bzw. groß vorkommt.
 * Satzanfänge und Wörter in Versalien zählen nicht, weil sie nichts über die Schreibweise verraten.
 */
export function buildCaseDictionary(texts) {
  const dict = new Map();
  for (const text of texts) {
    if (!text) continue;
    for (const sentence of String(text).split(/[.!?…:;]\s+|\n+|\s[–—-]\s/)) {
      const clean = sentence.replace(/^[\s"„“”‚‘’«»(]+/, '');
      [...clean.matchAll(WORD)].forEach((match, i) => {
        const word = match[0];
        // Satzanfang, VERSALIEN und zweite Glieder von Bindestrichwörtern ("Coming-out") sagen nichts aus
        if (i === 0 || word === word.toUpperCase() || clean[match.index - 1] === '-') return;
        const key = word.toLocaleLowerCase('de');
        const entry = dict.get(key) ?? { lower: 0, upper: 0 };
        if (word[0] === word[0].toLocaleLowerCase('de')) entry.lower++;
        else entry.upper++;
        dict.set(key, entry);
      });
    }
  }
  return dict;
}

const capitalize = (word) => word.charAt(0).toLocaleUpperCase('de') + word.slice(1).toLocaleLowerCase('de');

/**
 * Bringt einen Titel in Versalien in normale Schreibweise:
 * englische Titel in englischer Großschreibung ("The Beauty of Ballroom"),
 * deutsche nach dem Wörterbuch aus den Beschreibungstexten ("Was haben wir gelacht").
 */
export function smartCase(title, dict = new Map()) {
  if (!isAllCaps(title)) return title;
  const words = (title.match(WORD) ?? []).map((w) => w.toLowerCase());
  const english = words.filter((w) => ENGLISH_MARKERS.has(w)).length > words.filter((w) => GERMAN_MARKERS.has(w)).length;

  let first = true;
  return title.replace(new RegExp(`(${WORD.source})|([^A-Za-zÀ-ÖØ-öø-ÿ]+)`, 'g'), (token, word, gap) => {
    if (gap) {
      // Nach Doppelpunkt oder Gedankenstrich beginnt ein neuer Titelteil
      if (/[:–—]|\s-\s/.test(gap)) first = true;
      return gap;
    }
    const start = first;
    first = false;
    if (ACRONYMS.has(word) || (ROMAN.test(word) && word !== 'I' && word.length <= 4 && !start)) return word;
    const lower = word.toLocaleLowerCase('de');
    if (start) return capitalize(word);
    if (english) return ENGLISH_SMALL.has(lower) ? lower : capitalize(word);
    const entry = dict.get(lower);
    if (entry && entry.lower !== entry.upper) return entry.lower > entry.upper ? lower : capitalize(word);
    return GERMAN_LOWER.has(lower) ? lower : capitalize(word);
  });
}
