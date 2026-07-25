import { describe, expect, it } from 'vitest';
import {
  MIGRATIONS,
  MigrationError,
  migrateToCurrent,
  readSchemaVersion,
  type Migration,
} from './migrations';
import { CURRENT_SCHEMA_VERSION } from './types';
import { createSampleProject } from './sample';
import { projectSchema } from './schema';

describe('readSchemaVersion', () => {
  it('liest die Version aus ungeprüften Daten', () => {
    expect(readSchemaVersion({ schemaVersion: 1 })).toBe(1);
  });

  it('wirft mit einer Meldung, die einem Endnutzer etwas sagt', () => {
    // "Diese Datei stammt nicht aus dem Raumplaner" ist handlungsleitend,
    // "expected number, received undefined" ist es nicht.
    expect(() => readSchemaVersion({ foo: 1 })).toThrow(MigrationError);
    expect(() => readSchemaVersion({ foo: 1 })).toThrow(/nicht aus dem Raumplaner/);
  });

  it('wirft bei völlig fremden Daten', () => {
    expect(() => readSchemaVersion(null)).toThrow(MigrationError);
    expect(() => readSchemaVersion('{}')).toThrow(MigrationError);
  });
});

describe('migrateToCurrent', () => {
  it('lässt ein Projekt der aktuellen Version unverändert', () => {
    const project = createSampleProject();
    const migrated = migrateToCurrent(structuredClone(project));
    expect(migrated).toEqual(project);
  });

  it('verweigert Dateien aus einer neueren App-Version', () => {
    const future = { ...createSampleProject(), schemaVersion: CURRENT_SCHEMA_VERSION + 5 };
    expect(() => migrateToCurrent(future)).toThrow(/neueren Version/);
  });

  it('nennt in der Meldung die gefundene und die unterstützte Version', () => {
    const future = { ...createSampleProject(), schemaVersion: 99 };
    try {
      migrateToCurrent(future);
      expect.unreachable('hätte werfen müssen');
    } catch (error) {
      expect(error).toBeInstanceOf(MigrationError);
      const message = (error as MigrationError).message;
      expect(message).toContain('99');
      expect(message).toContain(String(CURRENT_SCHEMA_VERSION));
      expect((error as MigrationError).fileVersion).toBe(99);
    }
  });

  it('mutiert die Eingabe nicht', () => {
    const input = { ...createSampleProject() } as Record<string, unknown>;
    const before = structuredClone(input);
    migrateToCurrent(input);
    expect(input).toEqual(before);
  });
});

describe('Migrationskette', () => {
  it('ist lückenlos von 1 bis zur aktuellen Version', () => {
    // Dieser Test ist der eigentliche Zweck der Datei: er schlägt fehl, sobald
    // jemand CURRENT_SCHEMA_VERSION erhöht, ohne den Migrationsschritt
    // nachzuziehen. Genau dann würde sonst jede Bestandsdatei unlesbar.
    for (let version = 1; version < CURRENT_SCHEMA_VERSION; version++) {
      const step = MIGRATIONS.find((m) => m.from === version);
      expect(step, `Migrationsschritt von Version ${version} fehlt`).toBeDefined();
    }
  });

  it('enthält keine doppelten oder übersprungenen Schritte', () => {
    const versions = MIGRATIONS.map((m) => m.from);
    expect(new Set(versions).size).toBe(versions.length);
    for (const step of MIGRATIONS) {
      expect(step.from).toBeGreaterThanOrEqual(1);
      expect(step.from).toBeLessThan(CURRENT_SCHEMA_VERSION);
    }
  });
});

describe('Migrationsmechanik (mit eingeschleuster Kette)', () => {
  /**
   * Die echte Kette ist noch leer, die Mechanik muss trotzdem jetzt bewiesen
   * sein — sonst stellt sich erst beim ersten Formatwechsel heraus, ob sie
   * funktioniert, und dann liegen bereits Nutzerdateien im Umlauf.
   */
  function runChain(input: Record<string, unknown>, chain: Migration[], target: number) {
    let current = { ...input };
    let version = current.schemaVersion as number;
    while (version < target) {
      const step = chain.find((m) => m.from === version);
      if (!step) throw new MigrationError(`kein Schritt ab ${version}`, version);
      current = step.migrate(current);
      version += 1;
      current.schemaVersion = version;
    }
    return current;
  }

  const chain: Migration[] = [
    {
      from: 1,
      describe: 'ceilingHeight von cm auf mm',
      migrate: (p) => ({ ...p, ceilingHeight: (p.ceilingHeight as number) * 10 }),
    },
    {
      from: 2,
      describe: 'name ergänzen',
      migrate: (p) => ({ ...p, name: p.name ?? 'Unbenannt' }),
    },
  ];

  it('wendet die Schritte in Reihenfolge an und zählt die Version hoch', () => {
    const result = runChain({ schemaVersion: 1, ceilingHeight: 250 }, chain, 3);
    expect(result.ceilingHeight).toBe(2500);
    expect(result.name).toBe('Unbenannt');
    expect(result.schemaVersion).toBe(3);
  });

  it('überspringt Schritte, die vor der Dateiversion liegen', () => {
    const result = runChain({ schemaVersion: 2, ceilingHeight: 2500 }, chain, 3);
    expect(result.ceilingHeight).toBe(2500); // Schritt 1 lief nicht erneut
    expect(result.schemaVersion).toBe(3);
  });

  it('wirft bei einer Lücke in der Kette', () => {
    const gapped = chain.filter((m) => m.from !== 2);
    expect(() => runChain({ schemaVersion: 1, ceilingHeight: 250 }, gapped, 3)).toThrow(
      MigrationError,
    );
  });
});

describe('Migration und Validierung greifen ineinander', () => {
  it('ergibt nach der Migration ein schemakonformes Projekt', () => {
    const migrated = migrateToCurrent(createSampleProject());
    expect(projectSchema.safeParse(migrated).success).toBe(true);
  });
});
