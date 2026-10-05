# Kinoprogramm Leipzig

Das Wochenprogramm aller Leipziger Kinos auf einer schlichten Seite – ohne Werbung, ohne Schnickschnack.
Die Daten werden **täglich um 18:00 Uhr** automatisch aktualisiert (GitHub Actions) und die Seite liegt
kostenlos bei Vercel.

- Tagesauswahl für die nächsten 7 Tage
- Ansicht **nach Kino** oder **nach Film** („Wo läuft der Film noch?“ per Klick auf den Titel)
- Kinos ein-/ausblenden und Beginn eingrenzen („ab 18:00“, „bis 20:00“, „ab jetzt“) – wird im
  Browser gemerkt; Suche nach Titel oder Fassung (z. B. „omu“)
- Kino-Adressen öffnen die Route in Google Maps
- Uhrzeiten mit geschätzter Endzeit (Filmlänge + ca. 20 Min. Werbung), verlinkt direkt auf die
  Ticketbuchung bzw. die Filmseite des Kinos
- Gleiche Filme werden kinoübergreifend zusammengeführt; Sonderveranstaltungen („Premiere“,
  „Best of Cinema“, „+ Filmgespräch …“) erscheinen als Etikett an der Uhrzeit
- Merkliste: Stern hinter jeder Vorstellung antippen, die gemerkten Vorstellungen stehen gesammelt
  hinter dem Stern-Symbol oben rechts (wird im Browser gespeichert, vergangene Tage verschwinden)
- Glücksrad (Knopf unten auf der Seite oder Strg+Ü / ⌘+Ü)
- Hell/Dunkel je nach Systemeinstellung, optimiert fürs Handy; lässt sich als App auf den
  Home-Bildschirm legen und zeigt offline das zuletzt geladene Programm

## Kinos und Datenquellen

Abgedeckt sind die Kinos, die auf kinoprogramm-leipzig.de ein regelmäßiges Programm haben – ohne die
CT Lichtspiele Taucha, weil Taucha nicht zu Leipzig gehört. Die Daten kommen direkt von den Kinos bzw.
ihren Ticketsystemen – kinoprogramm-leipzig.de wird nicht benötigt:

| Kino | Quelle |
| --- | --- |
| Cineplex Leipzig | Ticketportal kinoheld ¹ ² |
| UCI Nova Eventis | Ticketportal kinoheld ¹ ² |
| CineStar Petersbogen | JSON-API von cinestar.de |
| Regina Palast | Programmdaten auf kinoleipzig.com |
| Passage Kinos | Terminliste auf passage-kinos.de |
| Schauburg | Wochenprogramm auf schauburg-leipzig.de |
| Kinobar Prager Frühling | Ticketsystem Cinetixx |
| Luru Kino in der Spinnerei | Ticketsystem Cinetixx |
| Schaubühne Lindenfels | Ticketsystem Cinetixx |
| Cineding | iCal-Kalender von cineding-leipzig.de |

¹ cineplex.de und uci-kinowelt.de blockieren automatische Abrufe (Cloudflare); kinoheld führt das
Programm beider Kinos inklusive Links zu deren Ticketshops.
² Die robots.txt der kinoheld-API untersagt automatische Zugriffe. Der Scraper ruft dort nur einmal
täglich je Kino eine einzige Abfrage ab. Wer darauf verzichten möchte, entfernt die beiden Kinos in
`scraper/src/cinemas.js`.

Fällt eine Quelle aus – oder findet sie plötzlich gar keine Vorstellungen mehr, obwohl am Vortag
noch welche angekündigt waren (meist ein Umbau der Kino-Webseite) –, bleiben die Vorstellungen dieses
Kinos vom letzten erfolgreichen Abruf stehen.
Unten auf der Seite steht unter „Datenquellen & Status“, ob alle Quellen aktuell sind.

## Aufbau

```
public/                 Die Webseite (statisch, kein Build nötig)
  index.html, app.js, style.css
  data/program.json     Das Programm – wird täglich neu geschrieben
scraper/                Node.js-Skript, das die Daten sammelt
  src/cinemas.js        Liste der Kinos und ihrer Quellen
  src/sources/          Ein Modul pro Quelle
  test/                 Tests mit echten Ausschnitten der Kino-Webseiten
.github/workflows/
  update.yml            Täglich 18:00 Uhr: Daten holen, committen → Vercel veröffentlicht automatisch
  test.yml              Tests bei Änderungen am Scraper
vercel.json             Vercel liefert den Ordner public/ aus
```

## Einrichtung (einmalig)

1. **Vercel verbinden**
   - Auf [vercel.com](https://vercel.com) mit dem GitHub-Konto anmelden (Hobby-Plan, kostenlos).
   - „Add New… → Project“ → dieses Repository importieren.
   - Einstellungen so lassen, wie Vercel sie aus `vercel.json` übernimmt (Framework „Other“,
     Output Directory `public`, kein Build-Befehl) → „Deploy“.
   - Fertig: Die Seite ist unter `https://<projektname>.vercel.app` erreichbar. Jeder Commit auf dem
     Standard-Branch – also auch die tägliche Aktualisierung – wird automatisch veröffentlicht.

2. **GitHub Actions prüfen**
   - Unter „Actions“ sollte der Workflow „Kinoprogramm aktualisieren“ erscheinen. Über „Run workflow“
     lässt er sich jederzeit manuell starten.
   - Falls der Workflow nicht pushen darf: Settings → Actions → General → Workflow permissions →
     „Read and write permissions“.

Geplante Workflows laufen immer auf dem Standard-Branch des Repositorys. Wer den Branch umbenennen
möchte (z. B. in `main`), macht das am besten vor dem Verbinden mit Vercel unter Settings → Branches.

## Wenn ein Kino fehlt oder falsche Daten zeigt

- Bei Problemen wird der Workflow-Lauf rot markiert und GitHub schickt eine E-Mail. Die Seite wird
  trotzdem aktualisiert; das betroffene Kino behält seine Daten vom letzten erfolgreichen Abruf. In
  der Zusammenfassung des Laufs steht, welches Kino betroffen ist und warum.
- Meist hat das Kino seine Webseite umgebaut. Dann muss das passende Modul in `scraper/src/sources/`
  angepasst werden.

## Lokal ausprobieren

```bash
cd scraper
npm ci
npm test              # Tests (ohne Netzwerk)
npm run scrape        # Programm abrufen und public/data/program.json schreiben
node src/index.js --dry-run   # nur abrufen und Übersicht anzeigen

cd ../public
python3 -m http.server 8000   # → http://localhost:8000
```

## Ein Kino hinzufügen

1. In `scraper/src/cinemas.js` einen Eintrag ergänzen.
2. Nutzt das Kino ein bekanntes System (Cinetixx, kinoheld, cineprog, iCal),
   reicht die passende `source`-Angabe. Sonst ein neues Modul in `scraper/src/sources/` schreiben und in
   `scraper/src/index.js` unter `SOURCES` eintragen.

Angaben ohne Gewähr – maßgeblich ist das Programm des jeweiligen Kinos.
