# Phase 0 — Risiko-Spike 3D (Android)

Der Spike beantwortet eine einzige Frage: **Trägt `expo-gl` + three.js eine
editierbare 3D-Ansicht auf einem echten Gerät?** Fällt die Antwort negativ
aus, wird nicht weitergebaut, sondern die Alternative besprochen.

Ich kann diesen Schritt nicht für dich ausführen. Nicht aus Bequemlichkeit:
Die Entwicklungsumgebung hier hat kein Android-SDK, und `dl.google.com` — wo
Googles Build-Artefakte liegen — ist gesperrt. Der Bau muss auf Expos
Servern laufen, und das Ergebnis muss ein echtes Telefon anzeigen.

---

## Was du brauchst

| | |
|---|---|
| Expo-Konto | kostenlos, [expo.dev](https://expo.dev) |
| Node.js | Version 20 oder neuer |
| Android-Telefon | zum Aufspielen des APK |
| Mac | **nein** — Android braucht keinen |
| Google-Play-Konto | **noch nicht** — erst zum Veröffentlichen |

---

## Ablauf

```bash
# 1. Abhängigkeiten
npm install

# 2. Bei Expo anmelden
npx eas login

# 3. Projekt mit dem Expo-Konto verknüpfen (einmalig)
npx eas init

# 4. Development Build bauen — läuft auf Expos Servern, dauert 10–20 Minuten
npx eas build --profile development --platform android
```

Am Ende steht ein Download-Link und ein QR-Code. Den QR-Code mit dem Telefon
scannen, das APK installieren (Android fragt nach der Erlaubnis, Apps aus
unbekannten Quellen zu installieren — die brauchst du).

```bash
# 5. Entwicklungsserver starten und mit der installierten App verbinden
npx expo start --dev-client
```

Danach in der App den Bildschirm **`/spike`** öffnen.

> **Warum kein Expo Go?** Skia, expo-gl und Reanimated sind native Module.
> Expo Go enthält sie nicht. Deshalb der eigene Development Build — der ist
> einmalig zu bauen und gilt danach für alle Codeänderungen.

---

## Was der Spike anzeigt

Oben links steht eine Messanzeige:

| Feld | Bedeutung |
|---|---|
| `fps` | Bilder pro Sekunde. **Färbt sich rot unter 50.** |
| `Dreiecke` | Größe der Szene — zum Einordnen der fps |
| `Treffer` | Name des angetippten Objekts, oder `—` |
| `Taps` | Treffer / Versuche gesamt |
| `Plattform` | Betriebssystemversion |

Bedienung: **Ziehen** dreht die Kamera, **zwei Finger** zoomen, **Tippen**
wählt ein Objekt (es färbt sich blau).

---

## Abnahmekriterien

Bitte alle fünf durchgehen und das Ergebnis zurückmelden:

| # | Kriterium | Bestanden, wenn |
|---|---|---|
| 1 | **Wand mit Aussparung** | Fenster und Tür sind echte Löcher, durch die man den Hintergrund sieht — keine aufgemalten Flächen |
| 2 | **Orbit-Kamera** | Drehen fühlt sich direkt an, `fps` bleibt beim Ziehen ≥ 50 |
| 3 | **Raycasting** | 10 gezielte Taps ergeben 10 Treffer. `Taps 10/10`, nicht `7/10` |
| 4 | **Skia neben GL** | Der Grundriss-Kasten unten rechts ist sichtbar, während 3D läuft — nichts flackert, nichts bleibt schwarz |
| 5 | **Dev Build** | Punkte 1–4 gemeinsam in einer Sitzung, ohne Absturz |

**Ein Screenshot mit sichtbarer Messanzeige ist die beste Rückmeldung.**

---

## Wenn es scheitert

Nicht selbst reparieren — melde zurück, **was genau** passiert:

- **Schwarzer Bildschirm, keine Fehlermeldung** → deutet auf `endFrameEXP`
  oder den GL-Kontext hin
- **Fehlertext auf rotem Grund** → der Spike fängt Ausnahmen ab und zeigt sie
  an; dieser Text ist die wertvollste Information
- **fps unter 30** → expo-gl trägt die Anforderung auf deinem Gerät nicht
- **Taps treffen daneben** → Umrechnung Punkte/Pixel oder die Kamera-Matrix

Die besprochenen Alternativen bei einem Fehlschlag: 3D nur als nicht
editierbare Vorschau, oder ganz ohne 3D in 1.0. Beides ist verkraftbar — die
Lückenberechnung und der Export, also der eigentliche Zweck der App, hängen
nicht an 3D.

---

## Danach: den Spike entfernen

`app/spike.tsx` ist Wegwerf-Code und **muss vor der Veröffentlichung
gelöscht** werden. Ein erreichbarer Debug-Bildschirm in einer
Store-Veröffentlichung ist bei Google ein Qualitätsmangel und bei Apple ein
Ablehnungsgrund unter Richtlinie 2.3.1.

---

## Zum Play Store, sobald es soweit ist

Zwei Dinge, die man besser früh weiß als spät:

**Kosten:** Google-Play-Entwicklerkonto **25 USD einmalig** (Apple verlangt
99 USD pro Jahr — deshalb ist Android zuerst auch wirtschaftlich die richtige
Reihenfolge).

**Die 12-Tester-Regel:** Neue *private* Entwicklerkonten müssen vor der
Freigabe für die Produktion einen **geschlossenen Test mit mindestens 12
Testern über 14 zusammenhängende Tage** durchführen. Das ist kein
Programmierproblem, sondern ein Terminproblem — die zwei Wochen laufen
unabhängig davon, ob der Code fertig ist.

**Praktische Folge:** Konto früh anlegen und die 12 Tester früh zusammen­
suchen. Der geschlossene Test kann mit einer unfertigen Version laufen, während
hier weiter an den Phasen 2 bis 7 gearbeitet wird.

Konten für *Organisationen* sind von der Regel ausgenommen, brauchen dafür
aber eine Handelsregister- bzw. D-U-N-S-Prüfung.
