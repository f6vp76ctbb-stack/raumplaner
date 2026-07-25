import { describe, expect, it } from 'vitest';
import {
  catalogItemImportSchema,
  mmSchema,
  openingSchema,
  projectSchema,
  roomSchema,
} from './schema';
import { formatValidationError, readableIssues } from './errors';
import { createSampleProject } from './sample';

describe('mmSchema', () => {
  it('nimmt ganze Millimeter an', () => {
    expect(mmSchema.safeParse(2340).success).toBe(true);
    expect(mmSchema.safeParse(0).success).toBe(true);
    expect(mmSchema.safeParse(-500).success).toBe(true);
  });

  it('lehnt Floats ab, statt sie stillschweigend zu runden', () => {
    // Wichtig: die Regel lautet "Millimeter als Integer". Würden wir hier
    // runden, verschwände der Fehler des Erzeugers und die Datei wäre still
    // etwas anderes als das, was der Nutzer gemessen hat.
    const result = mmSchema.safeParse(2340.5);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('ganze Millimeter');
    }
  });

  it('lehnt Strings ab', () => {
    expect(mmSchema.safeParse('2340').success).toBe(false);
  });
});

describe('openingSchema', () => {
  const base = {
    id: 'opening_1',
    type: 'window' as const,
    offset: 500,
    width: 600,
    height: 800,
    sillHeight: 1300,
  };

  it('nimmt ein gültiges Fenster an', () => {
    expect(openingSchema.safeParse(base).success).toBe(true);
  });

  it('verlangt bei einer Nische eine Tiefe', () => {
    const result = openingSchema.safeParse({ ...base, type: 'niche', sillHeight: 900 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(formatValidationError(result.error)).toContain('Tiefe');
    }
  });

  it('nimmt eine Nische mit Tiefe an', () => {
    const result = openingSchema.safeParse({
      ...base,
      type: 'niche',
      sillHeight: 900,
      depth: 120,
    });
    expect(result.success).toBe(true);
  });

  it('besteht darauf, dass eine Tür keine Brüstung hat', () => {
    const result = openingSchema.safeParse({
      ...base,
      type: 'door',
      sillHeight: 100,
    });
    expect(result.success).toBe(false);
  });

  it('lehnt eine Breite von 0 ab', () => {
    expect(openingSchema.safeParse({ ...base, width: 0 }).success).toBe(false);
  });
});

describe('roomSchema', () => {
  const closedRoom = {
    id: 'room_1',
    name: 'Bad',
    ceilingHeight: 2500,
    fixtures: [],
    walls: [
      { id: 'w1', start: { x: 0, y: 0 }, end: { x: 2400, y: 0 }, thickness: 115, openings: [] },
      {
        id: 'w2',
        start: { x: 2400, y: 0 },
        end: { x: 2400, y: 1800 },
        thickness: 115,
        openings: [],
      },
      {
        id: 'w3',
        start: { x: 2400, y: 1800 },
        end: { x: 0, y: 1800 },
        thickness: 115,
        openings: [],
      },
      { id: 'w4', start: { x: 0, y: 1800 }, end: { x: 0, y: 0 }, thickness: 115, openings: [] },
    ],
  };

  it('nimmt ein geschlossenes Polygon an', () => {
    expect(roomSchema.safeParse(closedRoom).success).toBe(true);
  });

  it('erkennt einen offenen Wandzug und nennt die Fundstelle', () => {
    const open = structuredClone(closedRoom);
    open.walls[1].end = { x: 2400, y: 1700 }; // passt nicht mehr zu w3.start

    const result = roomSchema.safeParse(open);
    expect(result.success).toBe(false);
    if (!result.success) {
      const text = formatValidationError(result.error);
      expect(text).toContain('nicht geschlossen');
      // Die Meldung muss beide Koordinaten nennen, sonst ist sie nicht
      // handlungsleitend.
      expect(text).toContain('2400');
      expect(text).toContain('1700');
    }
  });

  it('erkennt eine Öffnung, die über ihre Wand hinausragt', () => {
    const bad = structuredClone(closedRoom);
    bad.walls[0].openings = [
      {
        id: 'o1',
        type: 'window' as const,
        offset: 2200,
        width: 600, // endet bei 2800, Wand ist 2400 lang
        height: 800,
        sillHeight: 1300,
      },
    ] as never;

    const result = roomSchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(formatValidationError(result.error)).toContain('ragt über die Wand hinaus');
    }
  });

  it('verlangt mindestens drei Wände', () => {
    const twoWalls = { ...closedRoom, walls: closedRoom.walls.slice(0, 2) };
    expect(roomSchema.safeParse(twoWalls).success).toBe(false);
  });
});

describe('projectSchema', () => {
  it('nimmt das Beispielprojekt an', () => {
    // Der wichtigste Test der Datei: das Beispiel, das jeder Nutzer beim
    // ersten Start sieht, muss das eigene Schema erfüllen.
    const result = projectSchema.safeParse(createSampleProject());
    if (!result.success) {
      throw new Error(formatValidationError(result.error, 20));
    }
    expect(result.success).toBe(true);
  });

  it('überlebt einen JSON-Rundlauf verlustfrei', () => {
    const project = createSampleProject();
    const restored = projectSchema.parse(JSON.parse(JSON.stringify(project)));
    expect(restored).toEqual(project);
  });

  it('lehnt eine Datei ohne schemaVersion ab', () => {
    const { schemaVersion, ...withoutVersion } = createSampleProject();
    void schemaVersion;
    expect(projectSchema.safeParse(withoutVersion).success).toBe(false);
  });
});

describe('catalogItemImportSchema', () => {
  it('nimmt ein LLM-Objekt ohne id und source an', () => {
    const result = catalogItemImportSchema.safeParse({
      name: 'Unterschrank 40 cm',
      category: 'furniture',
      size: { w: 400, d: 350, h: 800 },
      defaultMountHeight: 0,
      clearances: { front: 450, back: 0, left: 0, right: 0 },
      notes: 'Tiefe unsicher, zwischen 340 und 360 gemessen',
    });
    expect(result.success).toBe(true);
  });

  it('lehnt ein halb ausgefülltes Objekt ab, statt Nullen einzusetzen', () => {
    const result = catalogItemImportSchema.safeParse({
      name: 'Irgendwas',
      category: 'furniture',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issues = readableIssues(result.error);
      const fields = issues.map((i) => i.path);
      expect(fields).toContain('size');
      expect(fields).toContain('clearances');
    }
  });

  it('lehnt Maße in Zentimetern ab, wenn sie als Float ankommen', () => {
    const result = catalogItemImportSchema.safeParse({
      name: 'Unterschrank',
      category: 'furniture',
      size: { w: 40.5, d: 35, h: 80 },
      defaultMountHeight: 0,
      clearances: { front: 450, back: 0, left: 0, right: 0 },
    });
    expect(result.success).toBe(false);
  });
});

describe('formatValidationError', () => {
  it('übersetzt Pfade in lesbare Orte mit 1-basierten Indizes', () => {
    const project = createSampleProject();
    project.floors[0].rooms[0].walls[2].thickness = -5;

    const result = projectSchema.safeParse(project);
    expect(result.success).toBe(false);
    if (!result.success) {
      const text = formatValidationError(result.error);
      // "Wand 3", nicht "walls.2" — der Nutzer zählt ab eins.
      expect(text).toContain('Wand 3');
      expect(text).toContain('Wandstärke');
    }
  });

  it('deckelt die Ausgabe, damit ein Totalschaden lesbar bleibt', () => {
    const broken = {
      id: 'x',
      name: 'x',
      createdAt: 'kein datum',
      schemaVersion: 1,
      floors: [
        {
          id: 'f',
          name: 'f',
          rooms: [
            { id: 'r', name: 'r', ceilingHeight: -1, walls: [], fixtures: [] },
            { id: 'r2', name: 'r2', ceilingHeight: -1, walls: [], fixtures: [] },
          ],
        },
      ],
      catalog: [],
    };

    const result = projectSchema.safeParse(broken);
    expect(result.success).toBe(false);
    if (!result.success) {
      const lines = formatValidationError(result.error, 2).split('\n');
      expect(lines.length).toBeLessThanOrEqual(3); // 2 Fehler + Sammelzeile
    }
  });
});
