# Kinoprogramm Leipzig & Hamburg

Das Wochenprogramm aller Kinos einer Stadt auf einer schlichten Seite – ohne Werbung, ohne
Schnickschnack. Zwei Seiten, gleicher Aufbau, gemeinsamer Code:

- **Leipzig:** https://kinoprogramm-leipzig.vercel.app
- **Hamburg und Umgebung:** https://kinoprogramm-hamburg.vercel.app

Die Daten werden **stündlich** automatisch aktualisiert (GitHub Actions, angestoßen von cron-job.org)
und die Seiten liegen kostenlos bei Vercel.

- Tagesauswahl für die nächsten 7 Tage
- Ansicht **nach Kino** oder **nach Film** („Wo läuft der Film noch?“ per Klick auf den Titel)
- Kinos ein-/ausblenden und Beginn eingrenzen („ab 18:00“, „bis 20:00“, „ab jetzt“) – wird im
  Browser gemerkt; Suche nach Titel oder Fassung (z. B. „omu“)
- Umkreis-Filter: Postleitzahl und Radius eingeben (z. B. „22523“, „15 km“) – Kinos weiter weg
  werden ausgeblendet, die Entfernung (Luftlinie) steht bei jedem Kino
- Kino-Adressen öffnen die Route in Google Maps
- Uhrzeiten mit geschätzter Endzeit (Filmlänge + ca. 20 Min. Werbung), verlinkt direkt auf die
  Ticketbuchung bzw. die Filmseite des Kinos
- Gleiche Filme werden kinoübergreifend zusammengeführt; Sonderveranstaltungen („Premiere“,
  „Best of Cinema“, „+ Filmgespräch …“) erscheinen als Etikett an der Uhrzeit
- IMDb-Bewertung neben dem Filmtitel („IMDb 7,4“, verlinkt auf IMDb) – nur bei sicherer Zuordnung
  und ab 25 Stimmen
- Merkliste: Stern hinter jeder Vorstellung antippen, die gemerkten Vorstellungen stehen gesammelt
  hinter dem Stern-Symbol oben rechts (wird im Browser gespeichert, vergangene Tage verschwinden)
- Glücksrad (Knopf unten auf der Seite oder Strg+Ü / ⌘+Ü)
- Hell/Dunkel je nach Systemeinstellung, optimiert fürs Handy; lässt sich als App auf den
  Home-Bildschirm legen und zeigt offline das zuletzt geladene Programm

## Kinos und Datenquellen

### Leipzig

Abgedeckt sind die Kinos, die auf kinoprogramm-leipzig.de ein regelmäßiges Programm haben – ohne die
CT Lichtspiele Taucha, weil Taucha nicht zu Leipzig gehört. Die Daten kommen direkt von den Kinos bzw.
ihren Ticketsystemen – kinoprogramm-leipzig.de wird nicht benötigt:

| Kino | Quelle |
| --- | --- |
| Cineplex Leipzig | Ticketportal kinoheld ¹ ² |
| UCI Nova Eventis | Ticketportal kinoheld ¹ ², ergänzt um kino-zeit.de ³ |
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
² Die robots.txt der kinoheld-API untersagt automatische Zugriffe. Der Scraper ruft dort einmal pro
Stunde je Kino eine einzige Abfrage ab. Wer darauf verzichten möchte, entfernt die Kinos in
`scraper/src/cities/leipzig.js` bzw. `hamburg.js`.
³ kinoheld bekommt die neue UCI-Woche oft erst Tage nach uci-kinowelt.de. Für jeden Tag zählt deshalb
die Quelle mit mehr Vorstellungen; Tage aus kino-zeit.de haben keinen Ticket-Link.

### Hamburg und Umgebung

37 Kinos: 26 in Hamburg und 11 im Umland bis etwa 30 km (Bargteheide, Buchholz, Buxtehude, Elmshorn,
Geesthacht, Neu Wulmstorf, Norderstedt, Quickborn, Stade, Uetersen, Winsen). Grundlage war die Liste
„Hamburg und Umgebung“ auf kinoprogramm.com, ergänzt um weitere Kinos aus kinoheld. Die vollständige
Liste mit Adressen steht in `scraper/src/cities/hamburg.js`.

| Quelle | Kinos |
| --- | --- |
| Ticketportal kinoheld ² | 31 Kinos – fast alle Hamburger Programmkinos verkaufen direkt darüber, CinemaxX, UCI, Kinopolis, Astor, Cineplex Elmshorn u. a. sind dort mit Programm und Link zum eigenen Ticketshop gelistet |
| Ticketsystem Cinetixx | Beluga Kino (Quickborn), Burg Kino Uetersen |
| JSON-API von cinestar.de | CineStar Stade |
| Programmdaten (cineprog) | City Kino Buxtehude |
| iCal-Kalender | Alabama Kino |
| kino-zeit.de ³ | Ergänzung für UCI Mundsburg und UCI Smart City Wandsbek |

Fällt eine Quelle aus – oder findet sie plötzlich gar keine Vorstellungen mehr, obwohl beim letzten
Abruf noch kommende angekündigt waren (meist ein Umbau der Kino-Webseite) –, bleiben die
Vorstellungen dieses Kinos vom letzten erfolgreichen Abruf stehen.
Unten auf der Seite steht unter „Datenquellen & Status“, ob alle Quellen aktuell sind.

## Aufbau

```
public/                 Leipziger Webseite (statisch, kein Build nötig) – zugleich Vorlage für Hamburg
  index.html, app.js, style.css
  data/program.json     Das Programm – wird stündlich neu geschrieben
hamburg/public/         Hamburger Webseite: aus public/ erzeugt (nur Stadtname getauscht), eigenes Programm
scraper/                Node.js-Skript, das die Daten sammelt
  src/cities/           Je Stadt die Liste der Kinos und ihrer Quellen
  src/sources/          Ein Modul pro Quelle
  src/sites.js          Erzeugt hamburg/public/ aus public/
  src/imdb.js           Ordnet die Filme IMDb zu und holt die Bewertungen
  src/plz.js            Erzeugt public/plz.json (Postleitzahlen → Koordinaten, für den Umkreis)
  data/imdb.json        Zwischenspeicher: IMDb-Nummer und Bewertung je Film
  test/                 Tests mit echten Ausschnitten der Kino-Webseiten
.github/workflows/
  update.yml            Stündlich: Daten beider Städte holen, committen → Vercel veröffentlicht
  test.yml              Tests bei Änderungen am Scraper oder an den Seiten
vercel.json             Vercel-Projekt Leipzig: liefert public/ aus
hamburg/vercel.json     Vercel-Projekt Hamburg (Root Directory „hamburg“): liefert hamburg/public/ aus
```

Änderungen an Aussehen und Funktionen der Seite immer in `public/` machen und danach
`npm run sites` (im Ordner `scraper`) ausführen – oder abwarten: Der stündliche Lauf erzeugt die
Hamburger Seite ebenfalls neu. Ein Test schlägt an, wenn beide auseinanderlaufen.
Jedes Vercel-Projekt baut nur neu, wenn sich sein Ordner geändert hat (`ignoreCommand`).

## IMDb-Bewertungen

Quelle sind die [offiziellen IMDb-Datensätze](https://developer.imdb.com/non-commercial-datasets/)
für persönliche, nicht-kommerzielle Nutzung – „Information courtesy of IMDb (https://www.imdb.com).
Used with permission.“ (steht auch unten auf der Seite).

- `src/imdb.js` läuft zu Beginn jedes stündlichen Laufs. Nur wenn neue Filme im Programm sind, lädt es
  die großen Dateien (rund 750 MB: alle Titel und die deutschen Verleihtitel) und sucht dort nach
  genau gleichem Titel – deutscher Titel, Originaltitel (von kinoheld) –, passend zu Jahr und Laufzeit.
  Im Zweifel bekommt ein Film keine Bewertung. Veranstaltungen (Sneak, Oper, Kurzfilmabende …) werden
  übersprungen, nicht gefundene Filme eine Woche später erneut gesucht.
- Die Bewertungen selbst (eine kleine Datei) werden einmal am Tag aufgefrischt.
- Eine falsche Zuordnung lässt sich in `scraper/data/imdb.json` korrigieren: beim Film die `id`
  durch die richtige IMDb-Nummer (`tt…`) ersetzen oder `"id": null, "skip": true` eintragen.

## Umkreis-Filter

Jedes Kino hat in `scraper/src/cities/*.js` seine Koordinaten (`location`, aus kinoheld bzw.
OpenStreetMap). Die Seite rechnet die Luftlinie zur eingegebenen Postleitzahl aus; deren
Koordinaten stehen in `public/plz.json` – alle Postleitzahlen bis 80 km um die Kinos der Städte,
aus den [GeoNames-Postleitzahlen](https://download.geonames.org/export/zip/) (CC BY 4.0). Die Datei
wird erst geladen, wenn jemand eine Postleitzahl eingibt. Neu erzeugen (nur nötig, wenn eine Stadt
dazukommt): `DE.zip` herunterladen, entpacken, `node src/plz.js DE.txt` und `npm run sites`.

## Einrichtung (einmalig)

1. **Vercel verbinden**
   - Auf [vercel.com](https://vercel.com) mit dem GitHub-Konto anmelden (Hobby-Plan, kostenlos).
   - „Add New… → Project“ → dieses Repository importieren.
   - Einstellungen so lassen, wie Vercel sie aus `vercel.json` übernimmt (Framework „Other“,
     Output Directory `public`, kein Build-Befehl) → „Deploy“.
   - Fertig: Die Seite ist unter `https://<projektname>.vercel.app` erreichbar. Jeder Commit auf dem
     Standard-Branch – also auch die stündliche Aktualisierung – wird automatisch veröffentlicht.
   - Für Hamburg ein zweites Projekt aus demselben Repository anlegen und als **Root Directory**
     `hamburg` eintragen; den Rest übernimmt `hamburg/vercel.json`.

2. **GitHub Actions prüfen**
   - Unter „Actions“ sollte der Workflow „Kinoprogramm aktualisieren“ erscheinen. Über „Run workflow“
     lässt er sich jederzeit manuell starten.
   - Falls der Workflow nicht pushen darf: Settings → Actions → General → Workflow permissions →
     „Read and write permissions“.

3. **Stündlich anstoßen mit cron-job.org**

   GitHubs eigener Zeitplan ist unzuverlässig: Geplante Läufe kommen oft stark verspätet oder gar
   nicht. Er bleibt in `update.yml` nur als Reserve alle 3 Stunden. Den stündlichen Takt gibt der
   kostenlose Dienst [cron-job.org](https://cron-job.org) vor:

   - **Schlüssel anlegen:** GitHub → Settings → Developer settings → Fine-grained personal access
     tokens → „Generate new token“. Nur dieses Repository, Berechtigung **Actions: Read and write**,
     Ablauf so lang wie möglich (GitHub schickt vor dem Ablauf eine Mail – dann neuen Schlüssel
     anlegen und bei cron-job.org austauschen).
   - **Cronjob anlegen:** URL
     `https://api.github.com/repos/<besitzer>/<repo>/actions/workflows/update.yml/dispatches`,
     Zeitplan stündlich, Methode `POST`, Request-Body `{"ref":"<Standard-Branch>"}` und diese Header:

     | Header | Wert |
     | --- | --- |
     | `Authorization` | `Bearer <Schlüssel>` |
     | `Accept` | `application/vnd.github+json` |
     | `X-GitHub-Api-Version` | `2026-03-10` |
     | `Content-Type` | `application/json` |

     Benachrichtigung bei Fehlschlägen einschalten. Ein Testlauf sollte mit Status 200 oder 204 enden
     und unter „Actions“ einen neuen Lauf starten.

Geplante Workflows laufen immer auf dem Standard-Branch des Repositorys. Wer den Branch umbenennen
möchte (z. B. in `main`), macht das am besten vor dem Verbinden mit Vercel unter Settings → Branches.

## Wenn ein Kino fehlt oder falsche Daten zeigt

- Bei Problemen wird der Workflow-Lauf rot markiert und GitHub schickt eine E-Mail – sobald ein
  Problem rund zwei Stunden (drei Läufe in Folge) besteht und danach einmal täglich gegen 18 Uhr,
  solange es anhält. Kurze Aussetzer einer Kino-Webseite lösen also keine Mail aus. Die Seite wird
  trotzdem aktualisiert; das betroffene Kino behält seine Daten vom letzten erfolgreichen Abruf. In
  der Zusammenfassung des Laufs steht, welches Kino betroffen ist und warum.
- Meist hat das Kino seine Webseite umgebaut. Dann muss das passende Modul in `scraper/src/sources/`
  angepasst werden.

## Lokal ausprobieren

```bash
cd scraper
npm ci
npm test              # Tests (ohne Netzwerk)
npm run scrape            # Leipzig abrufen und public/data/program.json schreiben
npm run scrape:hamburg    # Hamburg abrufen und hamburg/public/data/program.json schreiben
node src/index.js --city hamburg --dry-run   # nur abrufen und Übersicht anzeigen
npm run sites             # hamburg/public/ aus public/ neu erzeugen

cd ../public              # bzw. ../hamburg/public
python3 -m http.server 8000   # → http://localhost:8000
```

## Ein Kino hinzufügen

1. In `scraper/src/cities/leipzig.js` bzw. `hamburg.js` einen Eintrag ergänzen.
2. Nutzt das Kino ein bekanntes System (kinoheld, Cinetixx, CineStar, cineprog, iCal, kino-zeit.de),
   reicht die passende `source`-Angabe – die kinoheld-Nummer eines Kinos verrät die kinoheld-API
   (Abfrage `cinemas(search: "…")`). Mit `supplement` lässt sich eine zweite Quelle angeben, die
   Tage ergänzt, die der ersten noch fehlen (siehe UCI). Sonst ein neues Modul in
   `scraper/src/sources/` schreiben und in `scraper/src/index.js` unter `SOURCES` eintragen.

## Eine weitere Stadt

1. `scraper/src/cities/<stadt>.js` mit den Kinos (samt Koordinaten) anlegen und in
   `scraper/src/cities/index.js` eintragen (Name und Ordner der Seite, z. B. `<stadt>/public`);
   `public/plz.json` mit `node src/plz.js DE.txt` um die Postleitzahlen der Stadt erweitern.
2. In `scraper/src/sites.js` unter `SITE_TEXTS` die Ersetzungen für Stadtname und Beschreibung
   ergänzen, dann `npm run sites` und `npm run scrape -- --city <stadt>`.
3. `<stadt>/vercel.json` wie bei Hamburg anlegen, in `update.yml` einen Schritt für die Stadt
   ergänzen und bei Vercel ein Projekt mit Root Directory `<stadt>` anlegen.

Angaben ohne Gewähr – maßgeblich ist das Programm des jeweiligen Kinos.
