// kinotickets.express: Ticketsystem der CT Lichtspiele Taucha.
import * as cheerio from 'cheerio';
import { fetchText } from '../lib/http.js';
import { parseGermanDate, parseTime } from '../lib/dates.js';

const BASE = 'https://kinotickets.express';

export function parseKinotickets(html, referenceDate) {
  const $ = cheerio.load(html);
  const shows = [];
  $('li[id^="movie-"]').each((_, movie) => {
    const $movie = $(movie);
    const title = $movie.find('.grid > div').first().text().replace(/\s+/g, ' ').trim();
    if (!title) return;
    const badges = $movie
      .find('div.bg-primary')
      .map((_, b) => $(b).text().trim())
      .get();
    const extras = badges.includes('3D') ? ['3D'] : [];
    $movie.find('ul > li').each((_, day) => {
      const $day = $(day);
      const date = parseGermanDate($day.children('div').first().text(), referenceDate);
      if (!date) return;
      $day.find('a[href*="/booking/"]').each((_, a) => {
        const time = parseTime($(a).text());
        if (!time) return;
        shows.push({ date, time, title, extras, url: new URL($(a).attr('href'), BASE).href });
      });
    });
  });
  return shows;
}

export async function kinotickets({ slug }, { today }) {
  return parseKinotickets(await fetchText(`${BASE}/${slug}/movies`), today);
}
