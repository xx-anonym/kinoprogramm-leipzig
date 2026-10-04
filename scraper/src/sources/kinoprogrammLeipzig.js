// kinoprogramm-leipzig.de – nur Ersatzquelle:
//  * für Cineplex und UCI, deren Webseiten automatische Abrufe per Cloudflare blockieren,
//  * für Kinos, deren eigene Quelle gerade ausfällt,
//  * für gelegentliche Spielorte (Sommerkinos usw.), die dort zusätzlich auftauchen.
import * as cheerio from 'cheerio';
import { fetchText } from '../lib/http.js';
import { parseGermanDate, parseTime } from '../lib/dates.js';

const BASE = 'https://www.kinoprogramm-leipzig.de';

/** Liefert { [kinoId]: { name, address, shows: [...] } } für die aktuelle Kinowoche. */
export function parseKinoprogrammLeipzig(html, referenceDate) {
  const $ = cheerio.load(html);
  const cinemas = {};
  $('main section').each((_, section) => {
    const $section = $(section);
    const date = parseGermanDate($section.children('h2').first().text(), referenceDate);
    if (!date) return;
    $section.find('a[href^="/kino/"]').each((_, cinemaLink) => {
      const $cinemaLink = $(cinemaLink);
      const id = /\/kino\/(\d+)/.exec($cinemaLink.attr('href'))?.[1];
      if (!id) return;
      // Der Kino-Block ist der nächste Vorfahr, der auch die Filmzeilen enthält.
      const block = $cinemaLink.parents().filter((_, p) => $(p).find('a[href^="/programm/"]').length > 0).first();
      const entry = (cinemas[id] ??= {
        name: $cinemaLink.text().trim(),
        address: $cinemaLink
          .next('span')
          .text()
          .replace(/\s*(https?:\/\/)?www\.\S+/g, '')
          .replace(/\s+/g, ' ')
          .trim(),
        shows: [],
      });
      block.find('a[href^="/programm/"]').each((_, filmLink) => {
        const $filmLink = $(filmLink);
        const title = $filmLink.text().replace(/\s+/g, ' ').trim();
        const row = $filmLink.parent().parent();
        const url = new URL($filmLink.attr('href'), BASE).href;
        row.find('span.text-cinema-red').each((_, timeEl) => {
          const time = parseTime($(timeEl).text());
          if (!time) return;
          // Fassung/3D stehen als kleine Badges direkt hinter der Uhrzeit
          const badges = $(timeEl)
            .siblings('span')
            .map((_, b) => $(b).text().trim())
            .get();
          const version = badges.find((b) => /^(OmU|OmeU|OV)$/i.test(b)) ?? null;
          const extras = badges.filter((b) => /^3D$/i.test(b)).map(() => '3D');
          entry.shows.push({ date, time, title, version, extras, url });
        });
      });
    });
  });
  return cinemas;
}

export async function fetchKinoprogrammLeipzig({ today }) {
  return parseKinoprogrammLeipzig(await fetchText(`${BASE}/programm/woche`), today);
}
