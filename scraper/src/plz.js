// Erzeugt public/plz.json: Koordinaten der Postleitzahlen rund um die Städte (für den Umkreis-Filter).
// Quelle: GeoNames-Postleitzahlen (CC BY 4.0), https://download.geonames.org/export/zip/DE.zip
//
//   node src/plz.js DE.txt     # DE.txt aus der entpackten DE.zip; danach `node src/sites.js`
//
// Muss nur neu laufen, wenn eine Stadt dazukommt – Postleitzahlen ändern sich kaum.
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { CITIES } from './cities/index.js';

const RADIUS_KM = 80; // so weit um die Kinos einer Stadt herum

/** Luftlinie in km zwischen zwei Punkten [Breite, Länge]. */
export function distanceKm([lat1, lon1], [lat2, lon2]) {
  const rad = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * rad) / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error('Aufruf: node src/plz.js DE.txt');
  // Mittelpunkt jeder Stadt = Mittel ihrer Kinos
  const centers = Object.values(CITIES).map(({ cinemas }) => {
    const points = cinemas.map((c) => c.location).filter(Boolean);
    return [0, 1].map((i) => points.reduce((sum, p) => sum + p[i], 0) / points.length);
  });
  // Eine Postleitzahl kann mehrere Orte haben – dann zählt ihr Mittelpunkt
  const sums = new Map();
  for (const line of (await readFile(file, 'utf8')).split('\n')) {
    const cols = line.split('\t');
    const [plz, lat, lon] = [cols[1], Number(cols[9]), Number(cols[10])];
    if (!/^\d{5}$/.test(plz ?? '') || !lat || !lon) continue;
    const s = sums.get(plz) ?? { lat: 0, lon: 0, n: 0 };
    sums.set(plz, { lat: s.lat + lat, lon: s.lon + lon, n: s.n + 1 });
  }
  const result = {};
  for (const [plz, s] of [...sums].sort(([a], [b]) => a.localeCompare(b))) {
    const point = [Number((s.lat / s.n).toFixed(4)), Number((s.lon / s.n).toFixed(4))];
    if (centers.some((c) => distanceKm(c, point) <= RADIUS_KM)) result[plz] = point;
  }
  const out = join(CITIES.leipzig.siteDir, 'plz.json');
  await writeFile(out, `${JSON.stringify(result)}\n`);
  console.log(`${Object.keys(result).length} Postleitzahlen → ${out}`);
}

if (process.argv[1]?.endsWith('plz.js')) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
