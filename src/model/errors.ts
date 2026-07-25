/**
 * Übersetzt Zod-Fehler in etwas, das man einem Endnutzer zeigen kann.
 *
 * Motivation: der Import-Weg ist "Nutzer lässt ein Sprachmodell JSON bauen und
 * fügt es ein". Wenn dabei etwas schiefgeht, ist der rohe Zod-Dump nutzlos —
 * gebraucht wird ein Satz, den man dem Modell zurückwerfen kann, damit es die
 * Ausgabe korrigiert.
 */

import type { ZodError, ZodIssue } from 'zod';

export interface ReadableIssue {
  /** Punktnotierter Pfad, z. B. `floors.0.rooms.1.walls.2.thickness`. */
  path: string;
  /** Menschenlesbarer Ort, z. B. `Etage 1 › Raum 2 › Wand 3 › Wandstärke`. */
  where: string;
  message: string;
}

/** Feldnamen, die im Fehlertext deutsch erscheinen sollen. */
const FIELD_LABELS: Record<string, string> = {
  floors: 'Etage',
  rooms: 'Raum',
  walls: 'Wand',
  openings: 'Öffnung',
  fixtures: 'Objekt',
  catalog: 'Katalogeintrag',
  connections: 'Anschluss',
  thickness: 'Wandstärke',
  ceilingHeight: 'Deckenhöhe',
  mountHeight: 'Montagehöhe',
  sillHeight: 'Brüstungshöhe',
  clearances: 'Freiraum',
  position: 'Position',
  rotation: 'Drehung',
  size: 'Abmessungen',
  offset: 'Abstand',
  width: 'Breite',
  height: 'Höhe',
  depth: 'Tiefe',
  name: 'Name',
  category: 'Kategorie',
  schemaVersion: 'Dateiformat',
};

function labelFor(segment: string): string {
  return FIELD_LABELS[segment] ?? segment;
}

/**
 * Baut aus einem Zod-Pfad einen lesbaren Ort.
 * Array-Indizes werden 1-basiert ausgegeben, weil "Wand 0" niemandem hilft.
 */
function describePath(path: ReadonlyArray<string | number | symbol>): string {
  const parts: string[] = [];

  for (let i = 0; i < path.length; i++) {
    const segment = path[i];
    if (typeof segment === 'symbol') continue;

    if (typeof segment === 'number') {
      // Index gehört zum vorherigen Segment: `walls`, 2 -> `Wand 3`
      const previous = parts.pop();
      parts.push(previous ? `${previous} ${segment + 1}` : `#${segment + 1}`);
      continue;
    }

    parts.push(labelFor(segment));
  }

  return parts.length > 0 ? parts.join(' › ') : 'Datei';
}

function toReadable(issue: ZodIssue): ReadableIssue {
  return {
    path: issue.path.map(String).join('.'),
    where: describePath(issue.path),
    message: issue.message,
  };
}

/** Alle Fehler einer fehlgeschlagenen Validierung, lesbar aufbereitet. */
export function readableIssues(error: ZodError): ReadableIssue[] {
  return error.issues.map(toReadable);
}

/**
 * Ein zusammenhängender Fehlertext für die Anzeige im Import-Dialog.
 *
 * Begrenzt auf `limit` Einträge: bei einer komplett fehlgeformten Datei
 * produziert Zod dutzende Meldungen, und eine Wand aus 40 Zeilen Fehlertext
 * ist genauso unbrauchbar wie gar keine.
 */
export function formatValidationError(error: ZodError, limit = 6): string {
  const issues = readableIssues(error);
  const shown = issues.slice(0, limit);

  const lines = shown.map((issue) =>
    issue.where === 'Datei' ? `• ${issue.message}` : `• ${issue.where}: ${issue.message}`,
  );

  if (issues.length > shown.length) {
    lines.push(`• … und ${issues.length - shown.length} weitere Probleme.`);
  }

  return lines.join('\n');
}
