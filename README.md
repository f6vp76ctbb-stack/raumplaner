# Raumplaner

Maßstabsgetreue Erfassung von Wohnräumen. Räume aufnehmen, Möbel und
Sanitärobjekte platzieren, das Ergebnis als strukturierte Daten exportieren,
mit denen ein Sprachmodell arbeiten kann.

Die Leitfrage, die die App beantwortbar machen soll:
*„Passt zwischen Waschbecken und Wandecke noch ein 40-cm-Unterschrank?"*

**Vollständig offline.** Keine Netzwerkanfrage, kein Konto, kein Backend,
keine Analytik. Der Export ist das Kernfeature, nicht die Optik.

---

## Stand

| Phase | Inhalt | Stand |
|---|---|---|
| 0 | Risiko-Spike 3D (expo-gl + three.js) | **blockiert** — braucht macOS/Xcode und ein Gerät |
| 1 | Fundament: Typen, Zod, Store mit Undo/Redo, SQLite | **fertig** |
| 2 | Engine: Flächen, Lücken, Kollisionen | offen |
| 3 | 2D-Editor | offen |
| 4 | Katalog und Objekte | offen |
| 5 | Export (JSON + Markdown) | offen |
| 6 | 3D | offen |
| 7 | App-Store-Härtung | offen |

Getroffene Entscheidungen samt Begründung und Umkehrkosten: **[DECISIONS.md](./DECISIONS.md)**

---

## Aufbau

```
app/                    expo-router-Bildschirme
src/
  model/                Datenmodell, Zod-Schemata, Migrationen   [rein]
  engine/               Geometrie, Einheiten                     [rein]
  store/                Zustand-Store, Undo/Redo-Middleware
  db/                   SQLite-Persistenz                        [Expo]
  theme/                Gestaltungstoken
```

`[rein]` heißt: keine Importe von React, React Native, Expo, Skia, three.js
oder Zustand. Diese Schichten laufen in einem nackten Node-Prozess.

Die Regel wird **per Test erzwungen**, nicht per Absprache —
`src/engine/boundaries.test.ts` scannt beide Verzeichnisse und schlägt bei
einem verbotenen Import fehl.

---

## Entwickeln

```bash
npm install
npm test          # Vitest gegen Modell, Engine und Store
npm run typecheck # tsc --noEmit, strict
```

Tests und Typecheck laufen **ohne** macOS, Xcode oder Gerät — das ist der
Zweck der Schichttrennung.

### Development Build

Skia, expo-gl und Reanimated brauchen native Module. Expo Go reicht nicht.

```bash
npx eas build --profile development --platform ios
```

Voraussetzungen: Apple Developer Program, EAS-Account, ein registriertes
Testgerät. Ohne das ist kein Start auf iOS möglich.

---

## Technische Randbedingungen

- **Nativ, kein WebView.** Kein einziger Bildschirm.
- **Millimeter als Integer.** Keine Fließkommamaße im gespeicherten Zustand.
  Umrechnung in cm/m ausschließlich in der Anzeigeschicht.
- **New Architecture ist Pflicht.** Reanimated 4 unterstützt die alte
  Architektur nicht mehr; es gibt keinen Rückfallweg.
- **Versionen kommen aus dem Expo-SDK-Manifest**, nicht von npm-latest. SDK 57
  pinnt etwa `react-native-gesture-handler` auf `~2.32.0`, während npm-latest
  bei `3.1.0` steht. Immer `npx expo install`, nie `npm i`.

Aktuelle Basis: Expo SDK 57, React Native 0.86, React 19.2.3.

---

## Datenmodell in einem Absatz

Ein `Project` enthält `Floor`s, die `Room`s enthalten. Ein `Room` ist ein
geschlossenes Wandpolygon im Uhrzeigersinn plus eine Liste von `Fixture`s.
Wände tragen `Opening`s (Tür, Fenster, Durchgang, Nische). Koordinaten: x nach
rechts, y nach **unten**. `Wall.start`/`end` beschreiben die **Innenkante**;
`thickness` wächst nach außen. Jede dieser Festlegungen ist in
[DECISIONS.md](./DECISIONS.md) begründet und steht als Kommentarblock in
`src/model/types.ts`.
