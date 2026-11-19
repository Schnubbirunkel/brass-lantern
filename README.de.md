# Brass Lantern

[English](README.md) · **Deutsch**

Ein Interpreter für Interactive Fiction für Windows, macOS und Linux, mit automatischer Karte im Stil von Parchmap und einer Spielebibliothek, die mit IFDB abgeglichen wird.

## Was es kann

- **Formate:** Z-Code (.z3 bis .z8, .zblorb, auch Z6 über Bocfel), Glulx (.ulx, .gblorb, wahlweise Glulxe oder Git), TADS 2 und 3 (.gam, .t3), Hugo (.hex), ADRIFT 4 (.taf). Blorb-Dateien zeigen Titelbild, Titel und Autor in der Bibliothek, und Bilder im Spiel werden dargestellt.
- **Bibliothek:** Lege unter „Ordner …“ (oder in den Einstellungen) einen oder mehrere Spieleordner fest, auf Wunsch mit Unterordnern. Brass Lantern liest alle Story-Dateien ein und zeigt sie als Liste mit Titelbild, Autor, Jahr, Format und Bewertung. Rechts stehen Beschreibung, Genre, Spieldauer und Tags. Suche und Sortierung nach Titel, Autor, zuletzt gespielt, Bewertung, Jahr und Format.
- **IFDB-Abgleich:** Die Spiele werden über ihre IFID (Treaty of Babel: UUID, ZCODE-/GLULX-Kennung, TADS-GameInfo oder MD5) bei ifdb.org nachgeschlagen, ersatzweise über den Titel. Titelbilder und Daten werden lokal zwischengespeichert. Falsche oder fehlende Treffer kannst du mit „IFDB-Eintrag wählen …“ selbst zuordnen. Den Abgleich kannst du abschalten.
- **Einzelne Dateien:** Öffnen über den Dialog, per Drag & Drop, über „Öffnen mit …“ im Dateimanager oder als Argument (`brass-lantern spiel.z5`). Solche Dateien erscheinen ebenfalls in der Bibliothek.
- **Automapping:** Raumerkennung über die Statuszeile und fette Raumüberschriften. Bewegungen werden als Verbindungen eingetragen (englische und deutsche Richtungswörter). Hoch und Runter wechseln die Ebene, Rein und Raus werden gestrichelt gezeichnet.
  - Doppelklick auf einen Raum: Brass Lantern läuft automatisch dorthin.
  - Räume lassen sich verschieben, umbenennen, löschen und mit Notizen versehen.
  - Raumliste mit Suche, Kompass mit bekannten Ausgängen, Export als SVG.
  - Die Karte gehört zum Spielstand: Ein neues Spiel beginnt mit leerer Karte, „save“ sichert die Karte mit, „restore“ stellt genau diesen Kartenstand wieder her. Raumnotizen bleiben über alle Spielstände hinweg erhalten.
  - Die Karte lässt sich ausblenden (Strg/⌘+M, F2, `/map`).
- **Sprache:** Englisch (Standard) oder Deutsch, umschaltbar in den Einstellungen.
- **Komfort:** Befehlsverlauf (↑/↓), Autovervollständigung aus dem Spieltext (Tab), Befehle wie `/goto Küche` und `/note …`, Speichern und Laden mit normalem Dateidialog, Transkript-Export.
- **14 Stile:** Lectrote (Klassisch, Sepia, Schiefer), Gargoyle (hell, Lampenlicht), Parchmap (dunkel, hell), MS-DOS (Frotz-Blau, Infocom-Schwarz, mit VGA-Pixelschrift und F-Tastenleiste), Classic Mac System 7 (Nadelstreifen, Chicago-artige Pixelschrift), Mac OS 9 Platinum, Phosphor-Grün und -Bernstein (CRT), Pergament. Dazu lassen sich Schriftart, Schriftgröße, Zeilenabstand, Textbreite und ein CRT-Effekt für jeden Stil einstellen.

## Installation

Die fertigen Programme gibt es auf der [Release-Seite](https://github.com/Schnubbirunkel/brass-lantern/releases/latest).

### Windows
- **Installer:** `BrassLantern-Setup-1.2.0-x64.exe` (bzw. `-arm64` für Windows auf ARM). Da der Installer nicht signiert ist, zeigt Windows SmartScreen eine Warnung: „Weitere Informationen“ → „Trotzdem ausführen“.
- **Ohne Installation:** `Brass Lantern-1.2.0-win.zip` entpacken und `Brass Lantern.exe` starten.

### Linux
- **AppImage:** `chmod +x "Brass Lantern-1.2.0.AppImage"` und dann starten.
- **Debian/Ubuntu:** `sudo apt install ./brass-lantern_1.2.0_amd64.deb`

### macOS
Die Mac-Version ist nicht notarisiert. Nach dem Verschieben in „Programme“ einmal im Terminal ausführen:

```sh
xattr -cr "/Applications/Brass Lantern.app"
```

`-mac-arm64.zip` ist für Apple Silicon (M1 und neuer), die andere Datei für Intel-Macs.

Alternativ kannst du die App direkt auf dem Mac aus dem Quellcode bauen. Dann wird sie automatisch ad-hoc signiert:

```sh
npm install
npm run dist:mac
```

## Aus dem Quellcode starten

```sh
npm install
npm start
```

Node.js 20 oder neuer wird benötigt.

## Aufbau

- `src/main/` – Electron-Hauptprozess, Formaterkennung, Engine-Host (jede Geschichte läuft in einem eigenen Utility-Prozess)
- `src/renderer/js/glkote.js` – eigene GlkOte-Darstellung (Text-, Grid- und Grafikfenster, Eingabe, Stile)
- `src/renderer/js/automap.js` – Raumerkennung und Kartengraph
- `src/renderer/js/mapview.js` – SVG-Karte
- `src/renderer/css/themes.css` – alle Stile
- `tools/bitmap2ttf.py` – erzeugt die VGA- und Chicago-artigen Pixelschriften aus Bitmap-Fonts

## Lizenzen

Die Interpreter stammen aus [emglken](https://github.com/curiousdannii/emglken): Bocfel, Glulxe, Git und Hugo stehen unter MIT- bzw. BSD-Lizenz, TADS und SCARE unter GPL-2.0. Deshalb steht Brass Lantern als Ganzes unter der GPL. Die Schriften stammen von Fontsource (SIL OFL). Die Pixelschriften basieren auf den Bitmap-Fonts aus VileRs Sammlung [vga-text-mode-fonts](https://github.com/viler-int10h/vga-text-mode-fonts). Die Idee für das Automapping kommt von [Parchmap](https://github.com/roylaza/parchmap).
