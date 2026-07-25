/**
 * Migrationspfad für Projektdateien.
 *
 * Ab Tag 1 vorhanden, auch wenn es aktuell nur Version 1 gibt. Der Grund ist
 * nicht Vollständigkeit, sondern Disziplin: sobald die erste `.roomplan`-Datei
 * das Gerät eines Nutzers verlassen hat, ist das Format öffentlich und muss
 * für immer lesbar bleiben. Eine Migration nachträglich einzuziehen ist
 * deutlich teurer, als die leere Kette jetzt anzulegen.
 *
 * Regeln:
 *  - Migrationen laufen auf UNGEPRÜFTEN Daten (`unknown`), nicht auf typisierten
 *    Objekten. Ein Projekt der Version 1 erfüllt das Schema von Version 3 nicht,
 *    darum wird erst migriert und ganz am Ende einmal validiert.
 *  - Jede Migration hebt genau um eine Version an. Keine Sprünge.
 *  - Migrationen sind pure Funktionen und mutieren ihre Eingabe nicht.
 */

import { CURRENT_SCHEMA_VERSION } from './types';
import { versionProbeSchema } from './schema';

export interface Migration {
  /** Version, von der diese Migration ausgeht. Ergebnis ist `from + 1`. */
  readonly from: number;
  readonly describe: string;
  migrate(input: Record<string, unknown>): Record<string, unknown>;
}

/**
 * Registrierte Migrationen, aufsteigend.
 *
 * Beispiel für später:
 *   { from: 1, describe: 'Nischen bekommen eine Pflicht-Tiefe',
 *     migrate: (p) => ({ ...p, schemaVersion: 2, floors: … }) }
 */
export const MIGRATIONS: readonly Migration[] = [];

export class MigrationError extends Error {
  constructor(
    message: string,
    readonly fileVersion: number,
  ) {
    super(message);
    this.name = 'MigrationError';
  }
}

/**
 * Liest die Schemaversion aus ungeprüften Daten.
 * Wirft mit einer für Endnutzer lesbaren Meldung, wenn es keine gibt.
 */
export function readSchemaVersion(input: unknown): number {
  const probe = versionProbeSchema.safeParse(input);
  if (!probe.success) {
    throw new MigrationError(
      'Die Datei enthält keine schemaVersion. Sie stammt vermutlich nicht aus dem Raumplaner.',
      Number.NaN,
    );
  }
  return probe.data.schemaVersion;
}

/**
 * Hebt ungeprüfte Projektdaten auf die aktuelle Schemaversion an.
 *
 * Gibt die migrierten Daten zurück — weiterhin ungeprüft. Der Aufrufer muss
 * anschließend `projectSchema.safeParse` anwenden. Diese Trennung ist Absicht:
 * so kann die Importschicht Migrationsfehler ("zu neu") und Validierungsfehler
 * ("Wand 3 ist offen") getrennt formulieren.
 */
export function migrateToCurrent(input: unknown): Record<string, unknown> {
  const version = readSchemaVersion(input);

  if (version > CURRENT_SCHEMA_VERSION) {
    throw new MigrationError(
      `Diese Datei wurde mit einer neueren Version des Raumplaners erstellt ` +
        `(Format ${version}, diese App kann bis ${CURRENT_SCHEMA_VERSION}). ` +
        `Bitte aktualisiere die App.`,
      version,
    );
  }

  let current = { ...(input as Record<string, unknown>) };
  let currentVersion = version;

  while (currentVersion < CURRENT_SCHEMA_VERSION) {
    const migration = MIGRATIONS.find((m) => m.from === currentVersion);
    if (!migration) {
      throw new MigrationError(
        `Für das Dateiformat ${currentVersion} fehlt der Migrationsschritt. ` +
          `Das ist ein Fehler in der App, nicht in deiner Datei.`,
        version,
      );
    }
    current = migration.migrate(current);
    currentVersion += 1;
    current.schemaVersion = currentVersion;
  }

  return current;
}
