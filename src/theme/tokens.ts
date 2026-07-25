/**
 * Gestaltungstoken.
 *
 * Leitbild: technische Zeichnung, nicht Einrichtungskatalog. Die Oberfläche
 * tritt zurück, der Grundriss ist das Einzige mit visuellem Gewicht.
 *
 * Farbregel, bewusst eng gefasst:
 *   - Eine neutrale Grauachse trägt die gesamte Oberfläche.
 *   - GENAU EINE Signalfarbe für Selektion (Blau).
 *   - GENAU EINE für Konflikte (Rot).
 *   - Eine gedämpfte dritte für Snap-/Hilfsgeometrie, absichtlich schwächer
 *     als die beiden Signalfarben, damit sie nie mit ihnen konkurriert.
 * Keine weiteren Akzente. Kein Verlauf. Kein Schlagschatten als Dekoration.
 *
 * Bewusst vermieden: cremefarbener Grund, Serifen-Überschriften, Terracotta —
 * das ist der generische Look, den halbe Bibliotheken generierter Apps tragen,
 * und er ist bei Richtlinie 4.3 kein Vorteil.
 */

import { Platform } from 'react-native';

/* -------------------------------------------------------------------------
 * Farben
 * ---------------------------------------------------------------------- */

interface Palette {
  /** Hintergrund der Anwendung außerhalb des Canvas. */
  background: string;
  /** Flächen, die sich vom Hintergrund abheben (Paletten, Inspektor). */
  surface: string;
  /** Flächen eine Stufe höher (Eingabefelder, aktive Werkzeugknöpfe). */
  surfaceRaised: string;
  /** Trennlinien und Rahmen. */
  border: string;
  /** Kräftigere Trennlinie, etwa zwischen Werkzeugleiste und Canvas. */
  borderStrong: string;

  text: string;
  textMuted: string;
  /** Für Maßzahlen und Koordinaten — etwas ruhiger als Fließtext. */
  textNumeric: string;

  /** Zeichenfläche des Grundrisses. */
  canvas: string;
  /** Feines Raster. */
  grid: string;
  /** Jede fünfte bzw. zehnte Rasterlinie. */
  gridMajor: string;
  /** Wandkörper in der Aufsicht. */
  wall: string;
  /** Bemaßungslinien und -pfeile. */
  dimension: string;

  /** Die eine Signalfarbe für Auswahl. */
  selection: string;
  /** Dieselbe Farbe, flächig hinterlegt. */
  selectionFill: string;
  /** Die eine Signalfarbe für Kollisionen und verletzte Freiräume. */
  conflict: string;
  conflictFill: string;
  /** Hilfsgeometrie beim Einrasten. Absichtlich zurückgenommen. */
  snap: string;
}

const light: Palette = {
  background: '#f4f5f7',
  surface: '#ffffff',
  surfaceRaised: '#eceef1',
  border: '#d8dbe0',
  borderStrong: '#b4b9c1',

  text: '#16181d',
  textMuted: '#6b7280',
  textNumeric: '#2b2f38',

  canvas: '#fbfbfc',
  grid: '#e6e8ec',
  gridMajor: '#d2d6dd',
  wall: '#2b2f38',
  dimension: '#8a8f99',

  selection: '#1f6feb',
  selectionFill: 'rgba(31, 111, 235, 0.12)',
  conflict: '#d1242f',
  conflictFill: 'rgba(209, 36, 47, 0.12)',
  snap: '#9aa1ad',
};

const dark: Palette = {
  background: '#0f1115',
  surface: '#161a20',
  surfaceRaised: '#1e232b',
  border: '#2a303a',
  borderStrong: '#3d454f',

  text: '#e6e8ec',
  textMuted: '#8b929e',
  textNumeric: '#c9cdd4',

  canvas: '#12151a',
  grid: '#1c2027',
  gridMajor: '#272d36',
  wall: '#c9cdd4',
  dimension: '#767d89',

  selection: '#4c8ffb',
  selectionFill: 'rgba(76, 143, 251, 0.16)',
  conflict: '#f0616d',
  conflictFill: 'rgba(240, 97, 109, 0.16)',
  snap: '#6a7280',
};

export const palettes = { light, dark } as const;
export type ColorScheme = keyof typeof palettes;
export type { Palette };

/* -------------------------------------------------------------------------
 * Abstände
 *
 * 4-px-Raster. Bewusst wenige Stufen: mehr Auswahl führt nur dazu, dass
 * Abstände auseinanderlaufen.
 * ---------------------------------------------------------------------- */

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  /** Eingabefelder, Knöpfe. */
  sm: 4,
  /** Karten, Paletten. */
  md: 8,
} as const;

/* -------------------------------------------------------------------------
 * Schrift
 *
 * Zwei Familien, strikt nach Bedeutung getrennt:
 *   - System-Schrift für Fließtext und Beschriftungen.
 *   - Monospace für JEDE Zahl mit Maßcharakter.
 * Grund: in einer Bemaßungskette oder Objektliste müssen Ziffern in Spalten
 * stehen. Eine Proportionalschrift verschiebt sie gegeneinander und macht
 * zwei untereinanderstehende Maße optisch unvergleichbar.
 * ---------------------------------------------------------------------- */

export const fontFamily = {
  /** `undefined` überlässt React Native die Systemschrift (SF Pro auf iOS). */
  ui: undefined as string | undefined,
  /**
   * SF Mono ist auf iOS nicht öffentlich adressierbar; Menlo ist systemweit
   * vorhanden, metrisch stabil und für Ziffern gut lesbar.
   */
  mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
} as const;

/**
 * Basisgrößen in Punkt.
 *
 * Dynamic Type wird über `allowFontScaling` (Standard) auf allen
 * Nicht-Canvas-Bildschirmen wirksam. Auf dem Canvas skalieren Maßzahlen NICHT
 * mit, weil sie dort Teil der Zeichnung sind und ihre Größe zum Maßstab
 * gehört — eine mitwachsende Bemaßung würde die Zeichnung verdecken.
 */
export const fontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 28,
} as const;

export const fontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
} as const;

/* -------------------------------------------------------------------------
 * Zeichenkonstanten des Editors
 * ---------------------------------------------------------------------- */

export const canvas = {
  /** Feines Raster in Millimetern. */
  gridFineMm: 100,
  /** Betontes Raster in Millimetern. */
  gridMajorMm: 1000,
  /** Strichstärken in Punkt, unabhängig vom Zoom. */
  strokeHairline: 1,
  strokeWall: 1.5,
  strokeSelection: 2,
  /** Fangradius in Punkt (Bildschirm, nicht Modell). */
  snapRadiusPt: 14,
  /** Mindestgröße eines Griffs — 44 pt ist Apples Zielgröße für Touch. */
  handleHitSize: 44,
} as const;
