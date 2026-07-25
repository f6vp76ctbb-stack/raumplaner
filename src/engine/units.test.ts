import { describe, expect, it } from 'vitest';
import {
  formatArea,
  formatLength,
  isMm,
  mm2ToM2,
  NBSP,
  parseLength,
  roundMm,
} from './units';

describe('roundMm', () => {
  it('rundet auf ganze Millimeter', () => {
    expect(roundMm(2340.4)).toBe(2340);
    expect(roundMm(2340.6)).toBe(2341);
  });

  it('rundet symmetrisch um den Nullpunkt', () => {
    // Math.round(-0.5) wäre -0 und damit asymmetrisch zu Math.round(0.5) === 1.
    // Für Geometrie, die gespiegelt werden kann, ist das eine Fehlerquelle.
    expect(roundMm(0.5)).toBe(1);
    expect(roundMm(-0.5)).toBe(-1);
    expect(roundMm(1.5)).toBe(2);
    expect(roundMm(-1.5)).toBe(-2);
  });

  it('wirft bei nicht-endlichen Werten statt NaN zu liefern', () => {
    expect(() => roundMm(Number.NaN)).toThrow(RangeError);
    expect(() => roundMm(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});

describe('isMm', () => {
  it('akzeptiert nur sichere Integer', () => {
    expect(isMm(2340)).toBe(true);
    expect(isMm(0)).toBe(true);
    expect(isMm(-500)).toBe(true);
    expect(isMm(2340.5)).toBe(false);
    expect(isMm(Number.NaN)).toBe(false);
    expect(isMm('2340')).toBe(false);
  });
});

describe('formatLength', () => {
  it('gibt Millimeter unverändert aus', () => {
    expect(formatLength(2340, 'mm')).toBe('2340');
  });

  it('rechnet in cm und m um', () => {
    expect(formatLength(2340, 'cm')).toBe('234');
    expect(formatLength(2345, 'cm')).toBe('234,5');
    expect(formatLength(2340, 'm')).toBe('2,34');
    expect(formatLength(2000, 'm')).toBe('2');
  });

  it('setzt kein Tausendertrennzeichen', () => {
    // In einer Bemaßungskette müssen Ziffern in Spalten stehen; ein
    // Trennzeichen verschiebt sie gegeneinander.
    expect(formatLength(12345, 'mm')).toBe('12345');
  });

  it('hängt die Einheit nur auf Wunsch an', () => {
    expect(formatLength(2340, 'mm', { withUnit: true })).toBe(`2340${NBSP}mm`);
    expect(formatLength(2340, 'm', { withUnit: true })).toBe(`2,34${NBSP}m`);
  });

  it('trennt Zahl und Einheit mit einem geschützten Leerzeichen', () => {
    // Absicht, kein Zufall: in einer schmalen Bemaßungsspalte darf die Einheit
    // nicht allein in die nächste Zeile rutschen. Über Codepoints geprüft,
    // weil U+00A0 und U+0020 im Quelltext nicht unterscheidbar sind.
    expect(NBSP.codePointAt(0)).toBe(0x00a0);

    const formatted = formatLength(2340, 'mm', { withUnit: true });
    expect(formatted.includes(String.fromCodePoint(0x0020))).toBe(false);
    expect(formatted.includes(String.fromCodePoint(0x00a0))).toBe(true);
  });

  it('respektiert das Dezimaltrennzeichen', () => {
    expect(formatLength(2345, 'cm', { decimalSeparator: '.' })).toBe('234.5');
  });
});

describe('parseLength', () => {
  it('liest eine nackte Zahl in der Standardeinheit', () => {
    expect(parseLength('2340', 'mm')).toBe(2340);
    expect(parseLength('234', 'cm')).toBe(2340);
    expect(parseLength('2.34', 'm')).toBe(2340);
  });

  it('akzeptiert Komma als Dezimaltrennzeichen', () => {
    expect(parseLength('2,34', 'm')).toBe(2340);
  });

  it('lässt eine mitgetippte Einheit gegen die Standardeinheit gewinnen', () => {
    // Wer "cm" tippt, meint cm — auch wenn der Umschalter auf mm steht.
    expect(parseLength('234 cm', 'mm')).toBe(2340);
    expect(parseLength('2,34m', 'mm')).toBe(2340);
    expect(parseLength('50mm', 'm')).toBe(50);
  });

  it('rundet das Ergebnis auf ganze Millimeter', () => {
    expect(parseLength('23.45', 'cm')).toBe(235);
  });

  it('gibt null statt zu werfen, weil es bei jedem Tastendruck läuft', () => {
    expect(parseLength('', 'mm')).toBeNull();
    expect(parseLength('abc', 'mm')).toBeNull();
    expect(parseLength('23,4,5', 'mm')).toBeNull();
    expect(parseLength('12 km', 'mm')).toBeNull();
  });

  it('ist die Umkehrung von formatLength für ganze Millimeter', () => {
    for (const value of [0, 1, 999, 2340, 12345, -500]) {
      expect(parseLength(formatLength(value, 'mm'), 'mm')).toBe(value);
    }
  });
});

describe('Flächen', () => {
  it('rechnet Quadratmillimeter in Quadratmeter um', () => {
    expect(mm2ToM2(1_000_000)).toBe(1);
    expect(mm2ToM2(2_500_000)).toBe(2.5);
  });

  it('formatiert Flächen mit zwei Nachkommastellen', () => {
    // 3400 x 2200 mm
    expect(formatArea(3400 * 2200, { withUnit: true })).toBe(`7,48${NBSP}m²`);
  });
});
