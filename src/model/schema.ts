/**
 * Zod-Schemata für alles, was von außen in den Store gelangt.
 *
 * Regel: kein `JSON.parse`-Ergebnis erreicht den Store ohne diese Schicht,
 * und nirgends steht `any`. Rein — keine React-/RN-Importe.
 *
 * Die Fehlermeldungen sind deutschsprachig und auf Endnutzer gemünzt, weil
 * sie im Import-Dialog direkt angezeigt werden: der Nutzer bekommt JSON von
 * einem LLM zurück und muss ohne Entwicklerwissen erkennen, was fehlt.
 */

import { z } from 'zod';
import { CURRENT_SCHEMA_VERSION } from './types';

/* -------------------------------------------------------------------------
 * Primitive
 * ---------------------------------------------------------------------- */

/** Ein Maß: ganze Millimeter. Floats werden abgelehnt, nicht gerundet. */
export const mmSchema = z
  .number({ error: 'Maß muss eine Zahl sein.' })
  .int({ error: 'Maße müssen ganze Millimeter sein — 23.5 ist ungültig, 24 nicht.' })
  .finite({ error: 'Maß muss endlich sein.' });

/** Ein Maß, das echt größer als null sein muss (Breiten, Höhen, Stärken). */
export const positiveMmSchema = mmSchema.positive({
  error: 'Maß muss größer als 0 mm sein.',
});

/** Ein Maß, das nicht negativ sein darf (Abstände, Montagehöhen). */
export const nonNegativeMmSchema = mmSchema.min(0, {
  error: 'Maß darf nicht negativ sein.',
});

export const pointSchema = z.object({
  x: mmSchema,
  y: mmSchema,
});

export const clearancesSchema = z.object({
  front: nonNegativeMmSchema,
  back: nonNegativeMmSchema,
  left: nonNegativeMmSchema,
  right: nonNegativeMmSchema,
});

export const sizeSchema = z.object({
  w: positiveMmSchema,
  d: positiveMmSchema,
  h: positiveMmSchema,
});

export const fixtureCategorySchema = z.enum(
  [
    'sanitary',
    'furniture',
    'appliance',
    'door',
    'window',
    'radiator',
    'outlet',
    'custom',
  ],
  { error: 'Unbekannte Kategorie. Erlaubt sind u. a. sanitary, furniture, appliance, custom.' },
);

export const connectionTypeSchema = z.enum(
  ['drain', 'water-hot', 'water-cold', 'power', 'exhaust', 'antenna'],
  {
    error:
      'Unbekannter Anschlusstyp. Erlaubt: drain, water-hot, water-cold, power, exhaust, antenna.',
  },
);

export const connectionSchema = z.object({
  type: connectionTypeSchema,
  offset: z.object({ x: mmSchema, y: mmSchema, z: mmSchema }),
  note: z.string().optional(),
});

/* -------------------------------------------------------------------------
 * Öffnungen
 * ---------------------------------------------------------------------- */

export const openingTypeSchema = z.enum(['door', 'window', 'passage', 'niche'], {
  error: 'Öffnungstyp muss door, window, passage oder niche sein.',
});

export const doorSwingSchema = z.enum([
  'in-left',
  'in-right',
  'out-left',
  'out-right',
  'sliding',
]);

export const openingSchema = z
  .object({
    id: z.string().min(1, { error: 'Öffnung braucht eine id.' }),
    type: openingTypeSchema,
    offset: nonNegativeMmSchema,
    width: positiveMmSchema,
    height: positiveMmSchema,
    sillHeight: nonNegativeMmSchema,
    depth: positiveMmSchema.optional(),
    swing: doorSwingSchema.optional(),
  })
  .refine((o) => o.type !== 'niche' || o.depth !== undefined, {
    error: 'Eine Nische braucht eine Tiefe (depth) in Millimetern.',
    path: ['depth'],
  })
  .refine((o) => !(o.type === 'door' && o.sillHeight !== 0), {
    error: 'Eine Tür hat keine Brüstung — sillHeight muss 0 sein.',
    path: ['sillHeight'],
  });

/* -------------------------------------------------------------------------
 * Wände und Räume
 * ---------------------------------------------------------------------- */

export const wallSchema = z.object({
  id: z.string().min(1, { error: 'Wand braucht eine id.' }),
  start: pointSchema,
  end: pointSchema,
  thickness: positiveMmSchema,
  openings: z.array(openingSchema),
});

export const fixtureSchema = z.object({
  id: z.string().min(1, { error: 'Objekt braucht eine id.' }),
  catalogItemId: z.string().min(1).nullable(),
  name: z.string().min(1, { error: 'Objekt braucht einen Namen.' }),
  category: fixtureCategorySchema,
  position: pointSchema,
  rotation: z
    .number({ error: 'Drehung muss eine Zahl sein.' })
    .int({ error: 'Drehung muss in ganzen Grad angegeben sein.' })
    .min(0, { error: 'Drehung muss zwischen 0 und 359 Grad liegen.' })
    .max(359, { error: 'Drehung muss zwischen 0 und 359 Grad liegen.' }),
  size: sizeSchema,
  mountHeight: nonNegativeMmSchema,
  clearances: clearancesSchema,
  connections: z.array(connectionSchema).optional(),
  locked: z.boolean(),
});

export const roomSchema = z
  .object({
    id: z.string().min(1, { error: 'Raum braucht eine id.' }),
    name: z.string().min(1, { error: 'Raum braucht einen Namen.' }),
    ceilingHeight: positiveMmSchema,
    walls: z.array(wallSchema).min(3, {
      error: 'Ein Raum braucht mindestens 3 Wände, um eine Fläche zu umschließen.',
    }),
    fixtures: z.array(fixtureSchema),
    northAngle: z.number().int().min(0).max(359).optional(),
  })
  .superRefine((room, ctx) => {
    // Geschlossenheit des Polygons: walls[i].end muss walls[i+1].start sein.
    // Das ist die Invariante, an der ein von Hand oder per LLM erzeugtes
    // Projekt am ehesten scheitert, deshalb mit konkreter Fundstelle.
    const { walls } = room;
    for (let i = 0; i < walls.length; i++) {
      const current = walls[i];
      const next = walls[(i + 1) % walls.length];
      if (current.end.x !== next.start.x || current.end.y !== next.start.y) {
        ctx.addIssue({
          code: 'custom',
          path: ['walls', i, 'end'],
          message:
            `Wandzug ist nicht geschlossen: Wand ${i + 1} endet bei ` +
            `(${current.end.x}, ${current.end.y}), Wand ${((i + 1) % walls.length) + 1} ` +
            `beginnt aber bei (${next.start.x}, ${next.start.y}).`,
        });
      }
    }

    // Öffnungen müssen in ihre Wand passen.
    walls.forEach((wall, wallIndex) => {
      const length = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
      wall.openings.forEach((opening, openingIndex) => {
        if (opening.offset + opening.width > length + 0.5) {
          ctx.addIssue({
            code: 'custom',
            path: ['walls', wallIndex, 'openings', openingIndex, 'offset'],
            message:
              `Öffnung ragt über die Wand hinaus: sie endet bei ` +
              `${Math.round(opening.offset + opening.width)} mm, die Wand ist nur ` +
              `${Math.round(length)} mm lang.`,
          });
        }
      });
    });
  });

export const floorSchema = z.object({
  id: z.string().min(1, { error: 'Etage braucht eine id.' }),
  name: z.string().min(1, { error: 'Etage braucht einen Namen.' }),
  rooms: z.array(roomSchema),
});

/* -------------------------------------------------------------------------
 * Katalog
 * ---------------------------------------------------------------------- */

export const catalogSourceSchema = z.enum(['builtin', 'manual', 'import']);

export const catalogItemSchema = z.object({
  id: z.string().min(1, { error: 'Katalogeintrag braucht eine id.' }),
  name: z.string().min(1, { error: 'Katalogeintrag braucht einen Namen.' }),
  manufacturer: z.string().optional(),
  category: fixtureCategorySchema,
  size: sizeSchema,
  defaultMountHeight: nonNegativeMmSchema,
  clearances: clearancesSchema,
  connections: z.array(connectionSchema).optional(),
  source: catalogSourceSchema,
  notes: z.string().optional(),
});

/**
 * Schema für den Import EINES Katalogobjekts aus LLM-Ausgabe.
 *
 * Bewusst nachsichtiger als `catalogItemSchema`: id und source vergibt die
 * App, die kann ein Sprachmodell nicht wissen. Alles andere ist Pflicht,
 * damit ein halb ausgefülltes Objekt nicht stillschweigend mit Nullen im
 * Katalog landet.
 */
export const catalogItemImportSchema = catalogItemSchema
  .omit({ id: true, source: true })
  .extend({
    id: z.string().min(1).optional(),
  });

export type CatalogItemImport = z.infer<typeof catalogItemImportSchema>;

/* -------------------------------------------------------------------------
 * Projekt
 * ---------------------------------------------------------------------- */

export const projectSchema = z.object({
  id: z.string().min(1, { error: 'Projekt braucht eine id.' }),
  name: z.string().min(1, { error: 'Projekt braucht einen Namen.' }),
  createdAt: z.iso.datetime({
    error: 'createdAt muss ein ISO-8601-Zeitstempel sein, z. B. 2026-07-25T10:00:00.000Z.',
  }),
  schemaVersion: z
    .number()
    .int()
    .positive({ error: 'schemaVersion muss eine positive ganze Zahl sein.' }),
  floors: z.array(floorSchema),
  catalog: z.array(catalogItemSchema),
});

/**
 * Schema-Version einer noch ungeprüften Datei lesen, ohne den Rest zu
 * validieren. Das muss VOR der Migration passieren — eine Datei mit
 * schemaVersion 1 darf nicht am Schema von Version 3 scheitern.
 */
export const versionProbeSchema = z.object({
  schemaVersion: z.number().int().positive({
    error: 'Datei enthält keine gültige schemaVersion und ist kein Raumplaner-Projekt.',
  }),
});

export { CURRENT_SCHEMA_VERSION };
