// Alle Zeiten im Programm sind Leipziger Ortszeit (Europe/Berlin).

const TIME_ZONE = 'Europe/Berlin';

const isoDateFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const isoTimeFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Datum (YYYY-MM-DD) in Leipzig für einen Zeitpunkt. */
export function berlinDate(date = new Date()) {
  return isoDateFormat.format(date);
}

/** Uhrzeit (HH:MM) in Leipzig für einen Zeitpunkt. */
export function berlinTime(date) {
  return isoTimeFormat.format(date);
}

export function addDays(isoDate, days) {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const pad = (n) => String(n).padStart(2, '0');

/**
 * Ergänzt das Jahr zu einer Angabe wie "05.10." – gewählt wird das Jahr,
 * bei dem das Datum am nächsten am Referenzdatum liegt (wichtig zum Jahreswechsel).
 */
export function inferYear(day, month, referenceIsoDate) {
  const refYear = Number(referenceIsoDate.slice(0, 4));
  const ref = Date.parse(`${referenceIsoDate}T12:00:00Z`);
  let best = null;
  for (const year of [refYear - 1, refYear, refYear + 1]) {
    const iso = `${year}-${pad(month)}-${pad(day)}`;
    const distance = Math.abs(Date.parse(`${iso}T12:00:00Z`) - ref);
    if (!best || distance < best.distance) best = { iso, distance };
  }
  return best.iso;
}

/** "05.10." oder "05.10.2026" → YYYY-MM-DD */
export function parseGermanDate(text, referenceIsoDate) {
  const m = /(\d{1,2})\.(\d{1,2})\.(\d{4})?/.exec(text);
  if (!m) return null;
  const [, day, month, year] = m;
  if (year) return `${year}-${pad(month)}-${pad(day)}`;
  return inferYear(Number(day), Number(month), referenceIsoDate);
}

/** "14:15 Uhr" / "9.30" → HH:MM */
export function parseTime(text) {
  const m = /(\d{1,2})[:.](\d{2})/.exec(text);
  if (!m) return null;
  return `${pad(m[1])}:${m[2]}`;
}
