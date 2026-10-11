// Erzeugt die Webseiten weiterer Städte aus der Leipziger Seite (public/) als Vorlage: gleiche
// Dateien, nur Stadtname und Beschreibung ausgetauscht. Das Programm (data/) hat jede Stadt selbst.
//
//   node src/sites.js    # hamburg/public/ neu schreiben (nach Änderungen an public/)
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CITIES } from './cities/index.js';

const TEMPLATE = CITIES.leipzig.siteDir;
const TEXT_FILES = new Set(['.html', '.js', '.css', '.svg', '.webmanifest', '.json', '.txt']);

/** Ersetzungen je Stadt – die längeren zuerst. */
export const SITE_TEXTS = {
  hamburg: [
    ['Das Wochenprogramm aller Leipziger Kinos', 'Das Wochenprogramm der Kinos in Hamburg und Umgebung'],
    ['Leipzig', 'Hamburg'],
    ['leipzig', 'hamburg'],
  ],
};

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries
    .filter((e) => e.isFile())
    .map((e) => relative(dir, join(e.parentPath ?? e.path, e.name)))
    .filter((path) => !path.startsWith(`data/`) && !path.startsWith('data\\'))
    .sort();
}

/** Inhalt der Webseite einer Stadt: Map von Pfad (relativ zum Seitenordner) auf Inhalt. */
export async function renderSite(cityId) {
  const replacements = SITE_TEXTS[cityId];
  if (!replacements) throw new Error(`Keine Seitentexte für "${cityId}"`);
  const files = new Map();
  for (const path of await listFiles(TEMPLATE)) {
    const content = await readFile(join(TEMPLATE, path));
    if (!TEXT_FILES.has(extname(path))) {
      files.set(path, content);
      continue;
    }
    let text = content.toString('utf8');
    for (const [from, to] of replacements) text = text.split(from).join(to);
    files.set(path, Buffer.from(text, 'utf8'));
  }
  return files;
}

export async function writeSites() {
  for (const cityId of Object.keys(SITE_TEXTS)) {
    const dir = CITIES[cityId].siteDir;
    for (const [path, content] of await renderSite(cityId)) {
      await mkdir(dirname(join(dir, path)), { recursive: true });
      await writeFile(join(dir, path), content);
    }
    console.log(`Seite geschrieben: ${relative(process.cwd(), dir) || dir}`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  writeSites().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
