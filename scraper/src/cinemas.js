// Alle Kinos, die auf kinoprogramm-leipzig.de regelmäßig ein Programm haben.
// `kplId` ist die Kino-Nummer auf kinoprogramm-leipzig.de (für Ersatzdaten).
// Weitere Spielorte von dort (Sommerkinos usw.) werden automatisch ergänzt.

export const CINEMAS = [
  {
    id: 'cineplex',
    name: 'Cineplex Leipzig',
    address: 'Ludwigsburger Str. 13, 04209 Leipzig-Grünau',
    website: 'https://www.cineplex.de/leipzig/',
    kplId: '1',
    // cineplex.de blockiert automatische Abrufe (Cloudflare)
    source: { type: 'kinoprogramm-leipzig' },
  },
  {
    id: 'uci',
    name: 'UCI Nova Eventis',
    address: 'Merseburger Str. 17a, Günthersdorf (Nova Eventis)',
    website: 'https://www.uci-kinowelt.de/programm/leipzig/',
    kplId: '2',
    // uci-kinowelt.de blockiert automatische Abrufe (Cloudflare)
    source: { type: 'kinoprogramm-leipzig' },
  },
  {
    id: 'cinestar',
    name: 'CineStar Petersbogen',
    address: 'Petersstraße 44, 04109 Leipzig',
    website: 'https://www.cinestar.de/kino-leipzig',
    kplId: '52',
    source: { type: 'cinestar', cinemaId: 33 },
  },
  {
    id: 'regina',
    name: 'Regina Palast',
    address: 'Dresdner Straße 56, 04317 Leipzig',
    website: 'https://www.kinoleipzig.com/',
    kplId: '5',
    source: { type: 'cineprog', url: 'https://www.kinoleipzig.com/programm?filter=all' },
  },
  {
    id: 'passage',
    name: 'Passage Kinos',
    address: 'Hainstraße 19a, 04109 Leipzig',
    website: 'https://www.passage-kinos.de/',
    kplId: '37',
    source: { type: 'passage' },
  },
  {
    id: 'taucha',
    name: 'CT Lichtspiele Taucha',
    address: 'Karl-Große-Str. 2, 04425 Taucha',
    website: 'https://kinotaucha.de/',
    kplId: '9',
    source: { type: 'kinotickets', slug: 'taucha-ct-lichtspiele' },
  },
  {
    id: 'schauburg',
    name: 'Schauburg',
    address: 'Antonienstraße 21, 04229 Leipzig',
    website: 'https://www.schauburg-leipzig.de/',
    kplId: '4',
    source: { type: 'schauburg' },
  },
  {
    id: 'kinobar',
    name: 'Kinobar Prager Frühling',
    address: 'Bernhard-Göring-Str. 152, 04277 Leipzig',
    website: 'https://www.kinobar-leipzig.de/',
    kplId: '21',
    source: { type: 'cinetixx', cinemaId: '1627481494' },
  },
  {
    id: 'luru',
    name: 'Luru Kino in der Spinnerei',
    address: 'Spinnereistr. 7, 04179 Leipzig',
    website: 'https://www.luru-kino.de/',
    kplId: '38',
    source: { type: 'cinetixx', cinemaId: '2348716262' },
  },
  {
    id: 'schaubuehne',
    name: 'Schaubühne Lindenfels',
    address: 'Karl-Heine-Str. 50, 04229 Leipzig',
    website: 'https://www.schaubuehne.com/',
    kplId: '10',
    source: { type: 'cinetixx', cinemaId: '1898834974' },
  },
  {
    id: 'cineding',
    name: 'Cineding',
    address: 'Karl-Heine-Str. 83, 04229 Leipzig',
    website: 'https://www.cineding-leipzig.de/',
    kplId: '43',
    source: { type: 'ical', url: 'https://www.cineding-leipzig.de/events.ics' },
  },
];
