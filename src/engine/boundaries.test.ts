/**
 * Prüft die Schichtgrenzen statisch.
 *
 * Die Vorgabe lautet: `src/engine` und `src/model` enthalten reine
 * TypeScript-Logik ohne React, React Native oder Expo, damit sie in einem
 * nackten Node-Prozess laufen und ohne Änderung auch im Web lauffähig wären.
 *
 * Diese Regel per Test zu erzwingen statt per Absprache ist der Punkt: ein
 * versehentliches `import { Platform } from 'react-native'` in einer
 * Hilfsfunktion fällt sonst erst auf, wenn Monate später jemand die Engine in
 * einem anderen Kontext einbinden will.
 */

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(fileURLToPath(new URL('.', import.meta.url)), '..');

/** Schichten, die geräteunabhängig bleiben müssen. */
const PURE_LAYERS = ['engine', 'model'] as const;

/** Module, die in diesen Schichten nicht vorkommen dürfen. */
const FORBIDDEN = [
  'react',
  'react-native',
  'react-dom',
  'expo',
  '@shopify/react-native-skia',
  'three',
  'zustand',
];

function collectSourceFiles(directory: string): string[] {
  const found: string[] = [];

  for (const entry of readdirSync(directory)) {
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) {
      found.push(...collectSourceFiles(full));
      continue;
    }
    // Testdateien dürfen importieren, was sie brauchen.
    if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) found.push(full);
  }

  return found;
}

/** Liest alle Modulspezifizierer aus `import`- und `export … from`-Zeilen. */
function importedModules(source: string): string[] {
  const specifiers: string[] = [];
  const pattern = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s*['"]([^'"]+)['"]/g;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) specifiers.push(match[1]);

  // Seiteneffekt-Importe ohne `from`, z. B. `import 'react-native-gesture-handler'`.
  const bare = /(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g;
  while ((match = bare.exec(source)) !== null) specifiers.push(match[1]);

  return specifiers;
}

function isForbidden(specifier: string): boolean {
  if (specifier.startsWith('.') || specifier.startsWith('node:')) return false;
  return FORBIDDEN.some(
    (blocked) => specifier === blocked || specifier.startsWith(`${blocked}/`),
  );
}

describe('Schichtgrenzen', () => {
  for (const layer of PURE_LAYERS) {
    it(`src/${layer} importiert nichts Gerätespezifisches`, () => {
      const files = collectSourceFiles(join(SRC, layer));
      expect(files.length).toBeGreaterThan(0);

      const violations: string[] = [];
      for (const file of files) {
        for (const specifier of importedModules(readFileSync(file, 'utf8'))) {
          if (isForbidden(specifier)) {
            violations.push(`${file.slice(SRC.length + 1)} → ${specifier}`);
          }
        }
      }

      expect(violations).toEqual([]);
    });
  }

  it('erkennt einen Verstoß, wenn es einen gäbe', () => {
    // Der Wächter muss selbst geprüft sein — ein Test, der nie anschlägt,
    // ist von einem funktionierenden nicht zu unterscheiden.
    expect(isForbidden('react-native')).toBe(true);
    expect(isForbidden('react-native-gesture-handler')).toBe(false);
    expect(isForbidden('expo-sqlite')).toBe(false);
    expect(isForbidden('expo/config')).toBe(true);
    expect(isForbidden('./types')).toBe(false);
    expect(isForbidden('node:fs')).toBe(false);
    expect(isForbidden('zod')).toBe(false);
  });

  it('liest Modulspezifizierer aus mehrzeiligen Importen', () => {
    const source = [
      "import { a } from './a';",
      'import {',
      '  b,',
      '  c,',
      "} from 'react-native';",
      "export { d } from './d';",
      "import 'react-native-gesture-handler';",
    ].join('\n');

    expect(importedModules(source)).toEqual([
      './a',
      'react-native',
      './d',
      'react-native-gesture-handler',
    ]);
  });
});
