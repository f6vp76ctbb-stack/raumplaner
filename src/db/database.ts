/**
 * SQLite-Persistenz.
 *
 * Diese Datei darf Expo importieren — sie ist die Grenzschicht zum Gerät.
 * Modell, Engine und Store bleiben davon frei.
 *
 * ---------------------------------------------------------------------------
 * ABLAGEFORM: Dokument statt normalisierter Tabellen
 * ---------------------------------------------------------------------------
 * Ein Projekt liegt als ein einziges JSON-Dokument in einer Zeile, nicht in
 * normalisierten Tabellen für Etagen, Räume, Wände und Objekte.
 *
 * Begründung: die Domäne ist dokumentförmig und klein — eine Wohnung hat
 * Größenordnung 15 Räume, nicht 15 Millionen. Es gibt keine Abfrage, die über
 * Projekte hinweg joint. Normalisierung brächte hier nichts und kostete
 * dafür: Transaktionen über ein Dutzend Tabellen bei jedem Undo-Schritt, eine
 * zweite Migrationsebene neben `schemaVersion`, und Objektidentitäten, die
 * nach dem Laden nicht mehr denen im Store entsprechen.
 *
 * Der Katalog liegt bewusst DOPPELT: einmal als geräteweite Bibliothek in
 * `catalog_library` (damit ein importiertes Objekt projektübergreifend
 * verfügbar bleibt) und einmal eingebettet im Projektdokument (damit eine
 * exportierte .roomplan-Datei auf einem fremden Gerät vollständig ist).
 *
 * ---------------------------------------------------------------------------
 * ZWEI VERSIONSBEGRIFFE, NICHT VERWECHSELN
 * ---------------------------------------------------------------------------
 *  - `PRAGMA user_version`  : Aufbau der DATENBANK auf diesem Gerät.
 *  - `Project.schemaVersion`: Aufbau des DOKUMENTS, wandert mit der Datei mit.
 * Ein Dokument aus einer Mail hat eine schemaVersion, aber keine user_version.
 */

import * as SQLite from 'expo-sqlite';
import type { CatalogItem, Project } from '../model/types';
import { catalogItemSchema, projectSchema } from '../model/schema';
import { migrateToCurrent } from '../model/migrations';
import { formatValidationError } from '../model/errors';

const DATABASE_NAME = 'raumplaner.db';

/** Aufbaustand der lokalen Datenbank. Bei Änderungen erhöhen. */
const DATABASE_VERSION = 1;

let handle: SQLite.SQLiteDatabase | null = null;

/**
 * Öffnet die Datenbank und bringt sie auf den aktuellen Stand.
 * Mehrfachaufrufe liefern dieselbe Instanz.
 */
export async function openDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (handle) return handle;

  const db = await SQLite.openDatabaseAsync(DATABASE_NAME);

  // WAL: der Editor schreibt bei jeder Autosave-Runde, während die UI liest.
  // Ohne WAL blockieren sich beide gegenseitig.
  await db.execAsync('PRAGMA journal_mode = WAL;');
  await db.execAsync('PRAGMA foreign_keys = ON;');

  await migrateDatabase(db);

  handle = db;
  return db;
}

/** Nur für Tests und den Wechsel des Speicherorts. */
export async function closeDatabase(): Promise<void> {
  await handle?.closeAsync();
  handle = null;
}

async function migrateDatabase(db: SQLite.SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
  let version = row?.user_version ?? 0;

  if (version === 0) {
    await db.execAsync(`
      CREATE TABLE projects (
        id             TEXT    PRIMARY KEY NOT NULL,
        name           TEXT    NOT NULL,
        created_at     TEXT    NOT NULL,
        updated_at     TEXT    NOT NULL,
        schema_version INTEGER NOT NULL,
        document       TEXT    NOT NULL
      );

      CREATE TABLE catalog_library (
        id       TEXT PRIMARY KEY NOT NULL,
        name     TEXT NOT NULL,
        category TEXT NOT NULL,
        source   TEXT NOT NULL,
        item     TEXT NOT NULL
      );

      CREATE TABLE meta (
        key   TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );

      CREATE INDEX idx_projects_updated ON projects (updated_at DESC);
      CREATE INDEX idx_catalog_category ON catalog_library (category);
    `);
    version = 1;
    await db.execAsync(`PRAGMA user_version = ${version};`);
  }

  // Künftige Schritte hier anfügen:
  // if (version === 1) { await db.execAsync(...); version = 2; ... }

  if (version !== DATABASE_VERSION) {
    throw new Error(
      `Datenbank steht auf Version ${version}, erwartet wird ${DATABASE_VERSION}. ` +
        `Es fehlt ein Migrationsschritt.`,
    );
  }
}

/* -------------------------------------------------------------------------
 * Projekte
 * ---------------------------------------------------------------------- */

export interface ProjectSummary {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export class PersistenceError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'PersistenceError';
  }
}

/** Projektliste für den Startbildschirm, ohne die Dokumente zu laden. */
export async function listProjects(): Promise<ProjectSummary[]> {
  const db = await openDatabase();
  const rows = await db.getAllAsync<{
    id: string;
    name: string;
    created_at: string;
    updated_at: string;
  }>('SELECT id, name, created_at, updated_at FROM projects ORDER BY updated_at DESC;');

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

/**
 * Lädt ein Projekt.
 *
 * Auch beim Lesen aus der EIGENEN Datenbank läuft die volle Migration und
 * Validierung. Das ist Absicht: die Datei kann aus einem Backup stammen, das
 * mit einer älteren App-Version geschrieben wurde, und ein defektes Dokument
 * soll hier auffallen und nicht erst im Canvas.
 */
export async function loadProject(id: string): Promise<Project | null> {
  const db = await openDatabase();
  const row = await db.getFirstAsync<{ document: string }>(
    'SELECT document FROM projects WHERE id = ?;',
    [id],
  );
  if (!row) return null;

  return parseProjectDocument(row.document, `Projekt ${id}`);
}

/**
 * Prüft ungeprüften JSON-Text und gibt ein gültiges Projekt zurück.
 * Gemeinsamer Weg für Datenbank, Dateiimport und Share-Extension.
 */
export function parseProjectDocument(json: string, origin: string): Project {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new PersistenceError(`${origin}: Die Datei enthält kein gültiges JSON.`);
  }

  const migrated = migrateToCurrent(raw);
  const result = projectSchema.safeParse(migrated);

  if (!result.success) {
    throw new PersistenceError(
      `${origin} konnte nicht gelesen werden:\n${formatValidationError(result.error)}`,
    );
  }

  return result.data;
}

/** Schreibt ein Projekt. Legt an oder überschreibt. */
export async function saveProject(project: Project): Promise<void> {
  // Vor dem Schreiben validieren, nicht erst beim Lesen. Ein ungültiges
  // Dokument darf die Platte gar nicht erreichen.
  const result = projectSchema.safeParse(project);
  if (!result.success) {
    throw new PersistenceError(
      `Projekt "${project.name}" ist nicht speicherbar:\n${formatValidationError(result.error)}`,
    );
  }

  const db = await openDatabase();
  await db.runAsync(
    `INSERT INTO projects (id, name, created_at, updated_at, schema_version, document)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name           = excluded.name,
       updated_at     = excluded.updated_at,
       schema_version = excluded.schema_version,
       document       = excluded.document;`,
    [
      project.id,
      project.name,
      project.createdAt,
      new Date().toISOString(),
      project.schemaVersion,
      JSON.stringify(project),
    ],
  );
}

export async function deleteProject(id: string): Promise<void> {
  const db = await openDatabase();
  await db.runAsync('DELETE FROM projects WHERE id = ?;', [id]);
}

/* -------------------------------------------------------------------------
 * Katalogbibliothek (geräteweit, projektübergreifend)
 * ---------------------------------------------------------------------- */

export async function listCatalogLibrary(): Promise<CatalogItem[]> {
  const db = await openDatabase();
  const rows = await db.getAllAsync<{ item: string }>(
    'SELECT item FROM catalog_library ORDER BY name COLLATE NOCASE;',
  );

  const items: CatalogItem[] = [];
  for (const row of rows) {
    const parsed = catalogItemSchema.safeParse(JSON.parse(row.item));
    // Ein einzelner defekter Eintrag darf nicht die ganze Bibliothek
    // unbenutzbar machen — er wird übersprungen, nicht geworfen.
    if (parsed.success) items.push(parsed.data);
  }
  return items;
}

export async function upsertCatalogItem(item: CatalogItem): Promise<void> {
  const result = catalogItemSchema.safeParse(item);
  if (!result.success) {
    throw new PersistenceError(
      `Katalogeintrag "${item.name}" ist nicht speicherbar:\n` +
        formatValidationError(result.error),
    );
  }

  const db = await openDatabase();
  await db.runAsync(
    `INSERT INTO catalog_library (id, name, category, source, item)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name     = excluded.name,
       category = excluded.category,
       source   = excluded.source,
       item     = excluded.item;`,
    [item.id, item.name, item.category, item.source, JSON.stringify(item)],
  );
}

export async function deleteCatalogItem(id: string): Promise<void> {
  const db = await openDatabase();
  await db.runAsync('DELETE FROM catalog_library WHERE id = ?;', [id]);
}

/* -------------------------------------------------------------------------
 * Meta
 * ---------------------------------------------------------------------- */

export async function getMeta(key: string): Promise<string | null> {
  const db = await openDatabase();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM meta WHERE key = ?;',
    [key],
  );
  return row?.value ?? null;
}

export async function setMeta(key: string, value: string): Promise<void> {
  const db = await openDatabase();
  await db.runAsync(
    `INSERT INTO meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value;`,
    [key, value],
  );
}
