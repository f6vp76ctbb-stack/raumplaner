/**
 * Einheiten-Grenzschicht.
 *
 * Rein, ohne React/React-Native. Die Anzeigeschicht ruft `formatLength` auf,
 * die Eingabeschicht `parseLength`. Innerhalb von Modell und Engine existiert
 * ausschließlich `Mm` als Integer.
 */

import type { Mm } from '../model/types';

export type DisplayUnit = 'mm' | 'cm' | 'm';

/**
 * Rundet auf ganze Millimeter. Einziger erlaubter Übergang von Double nach Mm.
 *
 * `Math.round` rundet .5 immer Richtung +Unendlich, was bei negativen
 * Koordinaten asymmetrisch ist (-0.5 -> -0, 0.5 -> 1). Für Geometrie, die um
 * den Ursprung gespiegelt werden kann, ist das eine Fehlerquelle, deshalb
 * runden wir symmetrisch vom Nullpunkt weg.
 */
export function roundMm(value: number): Mm {
  if (!Number.isFinite(value)) {
    throw new RangeError(`roundMm: nicht-endlicher Wert ${value}`);
  }
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

/** Prüft, ob ein Wert ein gültiges Mm-Maß ist (endlicher Integer). */
export function isMm(value: unknown): value is Mm {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

/**
 * Geschütztes Leerzeichen zwischen Zahl und Einheit.
 *
 * Explizit als Escape geschrieben, damit im Quelltext sichtbar ist, dass hier
 * kein gewöhnliches Leerzeichen steht: "2340 mm" darf über einen Zeilenumbruch
 * nicht getrennt werden, sonst steht in einer schmalen Bemaßungsspalte die
 * Einheit allein in der nächsten Zeile.
 */
export const NBSP = '\u00a0';

const PER_UNIT: Record<DisplayUnit, number> = { mm: 1, cm: 10, m: 1000 };

/** Nachkommastellen, bei denen die Einheit noch ganze Millimeter auflöst. */
const DECIMALS: Record<DisplayUnit, number> = { mm: 0, cm: 1, m: 3 };

/**
 * Formatiert ein Maß für die Anzeige.
 *
 * Bewusst ohne Locale-Formatierung mit Tausendertrennung: in einer Bemaßungs-
 * kette sollen Ziffern in Spalten stehen, und ein Trennzeichen verschiebt sie.
 * Das Dezimaltrennzeichen ist konfigurierbar, weil Deutsch das Komma nutzt.
 */
export function formatLength(
  mm: Mm,
  unit: DisplayUnit = 'mm',
  options: { decimalSeparator?: string; withUnit?: boolean } = {},
): string {
  const { decimalSeparator = ',', withUnit = false } = options;
  const decimals = DECIMALS[unit];
  const raw = (mm / PER_UNIT[unit]).toFixed(decimals);
  // Nachlaufende Nullen entfernen, aber nie das Komma allein stehen lassen.
  const trimmed = decimals > 0 ? raw.replace(/\.?0+$/, '') : raw;
  const text = trimmed.replace('.', decimalSeparator);
  return withUnit ? `${text}${NBSP}${unit}` : text;
}

/**
 * Parst eine Nutzereingabe zu Millimetern.
 *
 * Akzeptiert Komma und Punkt als Dezimaltrennzeichen, optionales Leerzeichen
 * vor der Einheit und eine mitgetippte Einheit ("2340", "234 cm", "2,34m").
 * Eine mitgetippte Einheit gewinnt gegen `defaultUnit` — wer "cm" tippt,
 * meint cm, egal was der Umschalter sagt.
 *
 * Gibt `null` zurück, wenn die Eingabe nicht eindeutig interpretierbar ist.
 * Bewusst kein Wurf: das hier läuft bei jedem Tastendruck im Eingabefeld.
 */
export function parseLength(input: string, defaultUnit: DisplayUnit = 'mm'): Mm | null {
  const text = input.trim().toLowerCase().replace(',', '.');
  if (text === '') return null;

  const match = /^(-?\d*\.?\d+)\s*(mm|cm|m)?$/.exec(text);
  if (!match) return null;

  const value = Number.parseFloat(match[1]);
  if (!Number.isFinite(value)) return null;

  const unit = (match[2] as DisplayUnit | undefined) ?? defaultUnit;
  return roundMm(value * PER_UNIT[unit]);
}

/** Quadratmillimeter in Quadratmeter, für Flächenanzeige. */
export function mm2ToM2(areaMm2: number): number {
  return areaMm2 / 1_000_000;
}

/** Formatiert eine Fläche in m², standardmäßig auf zwei Nachkommastellen. */
export function formatArea(
  areaMm2: number,
  options: { decimals?: number; decimalSeparator?: string; withUnit?: boolean } = {},
): string {
  const { decimals = 2, decimalSeparator = ',', withUnit = false } = options;
  const text = mm2ToM2(areaMm2).toFixed(decimals).replace('.', decimalSeparator);
  return withUnit ? `${text}${NBSP}m²` : text;
}
