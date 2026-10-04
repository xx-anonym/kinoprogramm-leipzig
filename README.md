# Kinoprogramm Leipzig

Das Wochenprogramm aller Leipziger Kinos auf einer schlichten Seite – ohne Werbung, ohne Schnickschnack.
Die Daten werden **täglich um 18:00 Uhr** automatisch aktualisiert (GitHub Actions) und die Seite liegt
kostenlos bei Vercel.

- Tagesauswahl für die nächsten 7 Tage
- Ansicht **nach Kino** oder **nach Film** („Wo läuft der Film noch?“ per Klick auf den Titel)
- Kinos ein-/ausblenden (wird im Browser gemerkt), Suche nach Titel oder Fassung (z. B. „omu“)
- Uhrzeiten verlinken direkt auf die Ticketbuchung bzw. die Filmseite des Kinos
- Hell/Dunkel je nach Systemeinstellung, optimiert fürs Handy

## Kinos und Datenquellen

Abgedeckt sind alle Kinos, die auf kinoprogramm-leipzig.de ein regelmäßiges Programm haben. Die Daten
kommen – wo möglich – direkt von den Kinos:

| Kino | Quelle |
| --- | --- |
| CineStar Petersbogen | JSON-API von cinestar.de |
| Regina Palast | Programmdaten auf kinoleipzig.com |
| Passage Kinos | Terminliste auf passage-kinos.de |
| CT Lichtspiele Taucha | Ticketshop kinotickets.express |
| Schauburg | Wochenprogramm auf schauburg-leipzig.de |
| Kinobar Prager Frühling | Ticketsystem Cinetixx |
| Luru Kino in der Spinnerei | Ticketsystem Cinetixx |
| Schaubühne Lindenfels | Ticketsystem Cinetixx |
| Cineding | iCal-Kalender von cineding-leipzig.de |
| Cineplex Leipzig | kinoprogramm-leipzig.de ¹ |
| UCI Nova Eventis | kinoprogramm-leipzig.de ¹ |

¹ cineplex.de und uci-kinowelt.de blockieren automatische Abrufe (Cloudflare). Für diese beiden Kinos
dient deshalb kinoprogramm-leipzig.de als Quelle.

kinoprogramm-leipzig.de wird außerdem als **Ersatzquelle** genutzt:

- Fällt die eigene Quelle eines Kinos aus, kommen dessen Daten für diesen Tag von dort.
- Spielorte, die nur gelegentlich auftauchen (Sommerkinos, Open Air usw.), werden automatisch ergänzt.
- Ist gar nichts erreichbar, bleiben die Vorstellungen vom letzten erfolgreichen Abruf stehen.

Welche Quelle gerade genutzt wird, steht unten auf der Seite unter „Datenquellen & Status“.

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
  update.yml            Täglich 18:00 Uhr (+ donnerstags 7:00 Uhr zum Start der neuen Kinowoche):
                        Daten holen, committen → Vercel veröffentlicht automatisch
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
  trotzdem aktualisiert (mit Ersatzdaten). In der Zusammenfassung des Laufs steht, welches Kino
  betroffen ist und warum.
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
2. Nutzt das Kino ein bekanntes System (Cinetixx, kinotickets.express, cineprog/kinoheld, iCal), reicht
   die passende `source`-Angabe. Sonst ein neues Modul in `scraper/src/sources/` schreiben und in
   `scraper/src/index.js` unter `SOURCES` eintragen.

Angaben ohne Gewähr – maßgeblich ist das Programm des jeweiligen Kinos.
