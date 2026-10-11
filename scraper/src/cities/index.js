// Die Städte mit ihren Kinos und dem Ort, an dem ihr Programm landet. Jede Stadt hat eine eigene
// Webseite (Leipzig: public/, Hamburg: hamburg/public/), Scraper und Seitenvorlage sind gemeinsam.
import { fileURLToPath } from 'node:url';

import { CINEMAS as LEIPZIG } from './leipzig.js';
import { CINEMAS as HAMBURG } from './hamburg.js';

const root = (path) => fileURLToPath(new URL(`../../../${path}`, import.meta.url));

export const CITIES = {
  leipzig: { name: 'Leipzig', cinemas: LEIPZIG, siteDir: root('public') },
  hamburg: { name: 'Hamburg', cinemas: HAMBURG, siteDir: root('hamburg/public') },
};
