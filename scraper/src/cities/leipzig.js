// Die Kinos, die auf kinoprogramm-leipzig.de regelmäßig ein Programm haben (ohne Taucha) –
// die Daten kommen aber direkt von den Kinos bzw. ihren Ticketsystemen.

export const CINEMAS = [
  {
    id: 'cineplex',
    name: 'Cineplex Leipzig',
    address: 'Ludwigsburger Str. 13, 04209 Leipzig-Grünau',
    website: 'https://www.cineplex.de/leipzig/',
    // cineplex.de blockiert automatische Abrufe (Cloudflare) – Programm über kinoheld
    source: { type: 'kinoheld', cinemaId: '312' },
  },
  {
    id: 'uci',
    name: 'UCI Nova Eventis',
    address: 'Merseburger Str. 17a, Günthersdorf (Nova Eventis)',
    website: 'https://www.uci-kinowelt.de/programm/leipzig/',
    // uci-kinowelt.de blockiert automatische Abrufe (Cloudflare) – Programm über kinoheld. Das bekommt die
    // neue Woche aber oft erst Tage später; bis dahin ergänzt kino-zeit.de die fehlenden Tage.
    source: {
      type: 'kinoheld',
      cinemaId: '1235',
      supplement: { type: 'kinozeit', url: 'https://www.kino-zeit.de/kinoprogramm/guenthersdorf/uci-kinowelt-nova-eventis-guenthersdorf' },
    },
  },
  {
    id: 'cinestar',
    name: 'CineStar Petersbogen',
    address: 'Petersstraße 44, 04109 Leipzig',
    website: 'https://www.cinestar.de/kino-leipzig',
    source: { type: 'cinestar', cinemaId: 33 },
  },
  {
    id: 'regina',
    name: 'Regina Palast',
    address: 'Dresdner Straße 56, 04317 Leipzig',
    website: 'https://www.kinoleipzig.com/',
    source: { type: 'cineprog', url: 'https://www.kinoleipzig.com/programm?filter=all' },
  },
  {
    id: 'passage',
    name: 'Passage Kinos',
    address: 'Hainstraße 19a, 04109 Leipzig',
    website: 'https://www.passage-kinos.de/',
    source: { type: 'passage' },
  },
  {
    id: 'schauburg',
    name: 'Schauburg',
    address: 'Antonienstraße 21, 04229 Leipzig',
    website: 'https://www.schauburg-leipzig.de/',
    source: { type: 'schauburg' },
  },
  {
    id: 'kinobar',
    name: 'Kinobar Prager Frühling',
    address: 'Bernhard-Göring-Str. 152, 04277 Leipzig',
    website: 'https://www.kinobar-leipzig.de/',
    source: { type: 'cinetixx', cinemaId: '1627481494' },
  },
  {
    id: 'luru',
    name: 'Luru Kino in der Spinnerei',
    address: 'Spinnereistr. 7, 04179 Leipzig',
    website: 'https://www.luru-kino.de/',
    source: { type: 'cinetixx', cinemaId: '2348716262' },
  },
  {
    id: 'schaubuehne',
    name: 'Schaubühne Lindenfels',
    address: 'Karl-Heine-Str. 50, 04229 Leipzig',
    website: 'https://www.schaubuehne.com/',
    source: { type: 'cinetixx', cinemaId: '1898834974' },
  },
  {
    id: 'cineding',
    name: 'Cineding',
    address: 'Karl-Heine-Str. 83, 04229 Leipzig',
    website: 'https://www.cineding-leipzig.de/',
    source: { type: 'ical', url: 'https://www.cineding-leipzig.de/events.ics' },
  },
];
