# Entscheidungen

Festhalten, was entschieden wurde und **warum** — damit eine spätere Änderung
eine bewusste Änderung ist und keine versehentliche.

Jeder Eintrag nennt die Alternative, die verworfen wurde. Wer eine Entscheidung
kippen will, findet hier, was das kostet.

---

## E1 — Wandbezug: Innenkante

`Wall.start` / `Wall.end` beschreiben die **Innenkante** der Wand.
`thickness` wächst von dort nach außen.

**Warum:** Die Zahl, die vor Ort gemessen und eingetippt wird ("2340"), ist
damit direkt die gespeicherte Zahl. Bei Mittellinienbezug müsste jede Eingabe
um die halbe Wandstärke zurückgerechnet werden — bei ungerader Wandstärke mit
Rundung, und die Rundung wandert bei jeder Bearbeitung weiter.

**Verworfen:** Mittellinie. Wäre sauberer für Etagen, in denen sich Räume
Wände teilen — das ist mit E2 aber ohnehin ausgeschlossen.

**Kosten einer Umkehr:** Hoch. Jede Engine-Funktion, jeder Export und alle
Bestandsdateien hängen daran. Bei Änderung ist eine `schemaVersion`-Migration
zwingend.

---

## E2 — Räume sind unabhängige Polygone

Ein `Room` ist ein eigenständiges geschlossenes Polygon. Räume kennen einander
nicht; eine Wand zwischen zwei Räumen wird zweimal erfasst.

**Warum:** Vom Nutzer so entschieden. Die Alternative bräuchte echte
Topologieverwaltung (Wand teilen, Räume trennen und verbinden, Konsistenz bei
Undo) — deutlich mehr Engine und deutlich mehr Tests, ohne dass der
Kernanwendungsfall "Passt das in dieses Bad?" davon profitiert.

**Kosten einer Umkehr:** Hoch, aber additiv möglich — geteilte Wände ließen
sich später als Referenzen zwischen Räumen nachrüsten.

---

## E3 — Koordinatensystem: x rechts, y nach unten

Raumpolygone laufen im Uhrzeigersinn **wie auf dem Bildschirm gesehen**. Bei
y-nach-unten liefert die Shoelace-Formel dafür eine **positive** Fläche.

**Warum:** Deckungsgleich mit Skia und mit den Gesten-Koordinaten. Ein Flip
zwischen Modell und Canvas ist eine dauerhafte Fehlerquelle bei jeder
Hit-Test- und Snap-Rechnung.

**Kosten einer Umkehr:** Mittel, aber flächig — betrifft jede Geometriefunktion.

---

## E4 — Rotation wird nie ausgerechnet persistiert

Gespeichert werden nur `position`, `size` und `rotation` (Integer-Grad).
Rotierte Eckpunkte berechnet die Engine bei Bedarf neu.

**Warum:** Millimeter sind Integer, Drehungen erzeugen irrationale
Koordinaten. Würde man rotierte Ecken speichern, driftete ein Objekt nach
achtmal 15° messbar aus seiner Position. So ist Drift strukturell unmöglich,
nicht nur unwahrscheinlich.

---

## E5 — `Opening.offset` misst zur linken Kante

Gemessen von `Wall.start` in Richtung `end`, bis zur **linken Kante** der
Öffnung — nicht zu ihrer Mitte.

**Warum:** Das ist das Maß, das vor Ort genommen wird (Ecke bis Laibung). Eine
Mitte muss man ausrechnen und kann sie nicht messen.

---

## E6 — `Opening.depth` ergänzt

Zusätzliches optionales Feld, **Pflicht bei `type: 'niche'`** (per Zod
erzwungen).

**Warum:** Eine Nische ist durch ihre Tiefe definiert. Ohne das Feld ließe sie
sich weder in 3D aussparen noch in der nutzbaren Tiefe der Lückenberechnung
berücksichtigen — und genau dafür trägt man sie ein.

**Art der Änderung:** Additiv, bricht die Ursprungsspezifikation nicht.

---

## E7 — Öffnungen sind die einzige Wahrheit für Wanddurchbrüche

`FixtureCategory` behält `'door'` und `'window'` (Teil des Exportvertrags),
aber die Engine liest Durchbrüche **ausschließlich** aus `Wall.openings`.
Die beiden Kategorien sind für freistehende Objekte reserviert.

**Warum:** Beides parallel als Wahrheit zu führen, hieße zwei Quellen für
dieselbe Aussage — der klassische Weg zu Grundrissen, die in 2D und 3D
unterschiedlich aussehen.

---

## E8 — Keine Himmelsrichtungen ohne `northAngle`

Der Markdown-Export benennt Wände als "Wand A", "Wand B" … in
Polygonreihenfolge. Himmelsrichtungen nur, wenn `Room.northAngle` gesetzt ist.

**Warum:** Der Export soll ohne Zusatzkontext beantwortbar sein. Eine erfundene
Nordrichtung macht ihn nicht beantwortbar, sondern falsch — und zwar
unauffällig falsch, was schlimmer ist.

---

## E9 — Katalog liegt doppelt

Geräteweite Bibliothek in SQLite (`catalog_library`) **und** eingebetteter
Snapshot in jedem Projekt (`Project.catalog`).

**Warum:** Die Bibliothek erfüllt "danach dauerhaft im Katalog" aus der
Anforderung. Der eingebettete Snapshot macht eine exportierte
`.roomplan`-Datei selbsttragend — sie muss auf einem fremden Gerät ohne dessen
Bibliothek vollständig lesbar sein.

**Preis:** Redundanz. Bewusst in Kauf genommen; die Alternative wäre ein
Export, der auf dem Zielgerät stillschweigend unvollständig ist.

---

## E10 — Persistenz als Dokument, nicht normalisiert

Ein Projekt liegt als ein JSON-Dokument in einer Zeile.

**Warum:** Die Domäne ist dokumentförmig und klein (Größenordnung 15 Räume,
nicht 15 Millionen). Es gibt keine Abfrage, die über Projekte hinweg joint.
Normalisierung brächte hier nichts und kostete: Transaktionen über ein Dutzend
Tabellen bei jedem Speichern, eine zweite Migrationsebene neben
`schemaVersion`, und Objektidentitäten, die nach dem Laden nicht mehr denen im
Store entsprechen.

**Zwei Versionsbegriffe, nicht verwechseln:**
- `PRAGMA user_version` — Aufbau der Datenbank auf diesem Gerät
- `Project.schemaVersion` — Aufbau des Dokuments, wandert mit der Datei mit

---

## E11 — Undo/Redo selbst gebaut

Eigene Zustand-Middleware statt eines Fremdpakets.

**Warum:** Zwei Eigenschaften, die die verbreiteten Pakete nicht liefern:

1. `partialize` grenzt ein, was historisiert wird. Auswahl, Zoom und
   Werkzeugmodus liegen im selben Store, dürfen aber keinen Undo-Schritt
   erzeugen — sonst drückt der Nutzer dreimal Undo und hat nur die Auswahl
   zurückgesetzt.
2. Transaktionen. Ein Drag erzeugt pro Frame ein `set`; ohne Klammerung wären
   das 60 Undo-Schritte pro Sekunde.

Weil alle Mutationen immutabel sind, ist ein Schnappschuss eine einzige
Referenz — kein Deep Clone, konstante Kosten pro Schritt.

**Grenze:** 500 Schritte. "Über die gesamte Session" bleibt damit praktisch
erfüllt, ohne dass ein langer Arbeitstag den Speicher unbegrenzt füllt.

---

## E12 — Kein Web-Target

`react-dom` ist per `overrides` auf die zu React 19.2.3 passende Version
gepinnt, das `web`-Skript entfernt.

**Warum:** `expo-gl` führt `react-dom` als optionalen Peer für Web. npm
installierte daraufhin `react-dom@19.2.8`, das `react@^19.2.8` verlangt —
React Native 0.86 pinnt aber `react@19.2.3`. Das erzeugte einen echten
`ERESOLVE`-Konflikt. Da die App kein Web-Target hat, ist der Peer
gegenstandslos und wird weggepinnt statt umgangen.

---

## E13 — Geschütztes Leerzeichen zwischen Zahl und Einheit

`formatLength(…, { withUnit: true })` trennt Zahl und Einheit mit U+00A0
(geschütztes Leerzeichen), nicht mit U+0020.

**Warum:** In einer schmalen Bemaßungsspalte darf die Einheit nicht allein in
die nächste Zeile rutschen. Im Quelltext als Escape geschrieben, weil U+00A0
und U+0020 sonst nicht unterscheidbar sind — und per Codepoint getestet, aus
demselben Grund.

---

## E14 — Kein `expo-updates`

**Warum:** EAS-Builds ziehen `expo-updates` standardmäßig mit, und das Modul
kontaktiert beim Start einen Server. Bliebe es im Production-Build, wäre das
Privacy-Label "Keine Daten erhoben" **falsch**. Vor dem ersten Store-Upload
ist zu prüfen, dass es weder in `package.json` noch in der EAS-Konfiguration
auftaucht.

---

## E15 — Android und Play Store zuerst, iOS später

Vom Nutzer entschieden. Die Codebasis bleibt eine einzige; geändert hat sich
die Reihenfolge der Zielplattformen, nicht der Aufbau.

**Warum das gut zusammenpasst:** Der Nutzer hat keinen Mac. Android-Builds
brauchen keinen — EAS baut in der Cloud, das Ergebnis ist ein APK, das direkt
aufs Telefon geht. Ein iOS-Build wäre ohne Mac zwar auch über EAS möglich,
setzt aber ein Apple-Entwicklerkonto für 99 USD pro Jahr voraus. Play kostet
25 USD einmalig.

**Was sich dadurch ändert — durchweg zugunsten des Aufwands:**

| Vorhaben | iOS | Android |
|---|---|---|
| `.roomplan` als Dokumenttyp | eigene UTI, Info.plist | Intent-Filter + MIME-Typ, reine Konfiguration |
| JSON aus anderen Apps empfangen | Share-Extension = **zweites Xcode-Target** | Intent-Filter für `ACTION_SEND`, praktisch kostenlos |
| Kurzbefehle | App Intents, Swift-Plugin nötig | App Shortcuts, deutlich einfacher |
| Datenschutzangabe | `PrivacyInfo.xcprivacy` im Code | Data-Safety-Formular in der Play Console |
| Stift | Apple Pencil | S Pen / generischer Stylus |

Der teuerste Posten der ursprünglichen Anforderungsliste — die
Share-Extension — schrumpft auf Android zu einem Eintrag in `app.json`. Das
ist der größte Einzelgewinn dieser Reihenfolge.

**Was bestehen bleibt:** Kein WebView, vollständig offline, Millimeter als
Integer, Engine ohne UI-Abhängigkeit. Diese Vorgaben sind plattformunabhängig
und gelten unverändert.

**Kosten einer Umkehr:** Gering. Es wurde nichts iOS-Spezifisches gebaut,
und `app.json` trägt beide Plattformen nebeneinander.

---

## E16 — `expo-dev-client` statt Expo Go

**Warum:** Skia, expo-gl und Reanimated sind native Module; Expo Go enthält
sie nicht. Der Development Build wird einmal gebaut und gilt danach für alle
JavaScript-Änderungen — die Kosten fallen genau einmal an.

---

## Offen — noch zu entscheiden

| Thema | Stand |
|---|---|
| **Phase-0-Ergebnis** | **wartet auf dich** — Runbook in [PHASE0.md](./PHASE0.md), Abnahme über die fünf Kriterien dort |
| Google-Play-Konto angelegt? | offen — 25 USD einmalig; die 12-Tester-Regel über 14 Tage läuft unabhängig vom Code und sollte früh starten |
| Tablets gleichwertig? | Ursprungsbriefing sagt ja ("primär ein Tablet-Werkzeug"), spätere Antwort sagt "fürs Handy". Aktuell laufen beide mit, weil freie Bildschirmdrehung nichts kostet |
| Minimum-Android-Version | Empfehlung: API 24 (Android 7). Expo SDK 57 setzt die Untergrenze ohnehin |
| iOS wann? | nach der Play-Veröffentlichung; braucht dann Apple-Konto für 99 USD/Jahr |
| Speichert `.roomplan` auch Fotos? | Empfehlung: nein, reines JSON |
| Dachschrägen in der Lückenberechnung? | Empfehlung: 1.0 ohne |
