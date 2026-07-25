/**
 * Beispielprojekt beim ersten Start.
 *
 * Zwei Gründe, warum das kein Beiwerk ist:
 *  - Eine leere App wirkt im App-Review funktionsarm; das ist ein häufiger
 *    Auslöser für Richtlinie 4.2.
 *  - Es ist die Fixture, gegen die die Engine-Tests rechnen. Ein realistisches
 *    Bad ist genau der Fall, für den die Lückenberechnung existiert.
 *
 * Das modellierte Bad ist bewusst knapp geschnitten (2400 × 1800 mm), damit
 * Freiräume und Kollisionen tatsächlich greifen und nicht überall Platz ist.
 *
 * Alle IDs sind fest verdrahtet statt zufällig: das Beispiel muss bei jedem
 * Start identisch sein, sonst sind Tests nicht reproduzierbar.
 */

import type { CatalogItem, Project, Room } from './types';
import { CURRENT_SCHEMA_VERSION } from './types';

const CEILING_HEIGHT = 2500;

/* -------------------------------------------------------------------------
 * Katalog
 *
 * Maße und Freiräume orientieren sich an der DIN 68935 (Bäder) bzw. den in
 * der Sanitärplanung üblichen Bewegungsflächen. Sie sind Startwerte, keine
 * Norm-Zusicherung — der Nutzer kann jeden Wert überschreiben.
 * ---------------------------------------------------------------------- */

export const BUILTIN_CATALOG: CatalogItem[] = [
  {
    id: 'catalog_builtin_washbasin_600',
    name: 'Waschbecken 60 cm',
    category: 'sanitary',
    size: { w: 600, d: 480, h: 200 },
    defaultMountHeight: 850,
    clearances: { front: 550, back: 0, left: 100, right: 100 },
    connections: [
      { type: 'drain', offset: { x: 0, y: 100, z: 500 } },
      { type: 'water-cold', offset: { x: -50, y: 100, z: 550 } },
      { type: 'water-hot', offset: { x: 50, y: 100, z: 550 } },
    ],
    source: 'builtin',
  },
  {
    id: 'catalog_builtin_wc_wall',
    name: 'Wand-WC',
    category: 'sanitary',
    size: { w: 380, d: 540, h: 400 },
    defaultMountHeight: 400,
    clearances: { front: 600, back: 0, left: 200, right: 200 },
    connections: [{ type: 'drain', offset: { x: 0, y: 150, z: 220 } }],
    source: 'builtin',
  },
  {
    id: 'catalog_builtin_shower_900',
    name: 'Dusche 90 × 90',
    category: 'sanitary',
    size: { w: 900, d: 900, h: 2000 },
    defaultMountHeight: 0,
    clearances: { front: 550, back: 0, left: 0, right: 0 },
    connections: [{ type: 'drain', offset: { x: 0, y: 0, z: 0 } }],
    source: 'builtin',
  },
  {
    id: 'catalog_builtin_vanity_400',
    name: 'Unterschrank 40 cm',
    category: 'furniture',
    size: { w: 400, d: 350, h: 800 },
    defaultMountHeight: 0,
    clearances: { front: 450, back: 0, left: 0, right: 0 },
    source: 'builtin',
  },
  {
    id: 'catalog_builtin_washing_machine',
    name: 'Waschmaschine',
    category: 'appliance',
    size: { w: 600, d: 600, h: 850 },
    defaultMountHeight: 0,
    clearances: { front: 700, back: 50, left: 20, right: 20 },
    connections: [
      { type: 'power', offset: { x: 250, y: 250, z: 700 } },
      { type: 'water-cold', offset: { x: 200, y: 250, z: 750 } },
      { type: 'drain', offset: { x: -200, y: 250, z: 650 } },
    ],
    source: 'builtin',
  },
  {
    id: 'catalog_builtin_radiator_600',
    name: 'Handtuchheizkörper 60 cm',
    category: 'radiator',
    size: { w: 600, d: 100, h: 1200 },
    defaultMountHeight: 600,
    clearances: { front: 150, back: 0, left: 0, right: 0 },
    source: 'builtin',
  },
];

/* -------------------------------------------------------------------------
 * Beispielraum: Bad, 2400 × 1800 mm
 *
 * Polygon im Uhrzeigersinn (y zeigt nach unten):
 *   A (0,0) ──▶ B (2400,0)
 *     ▲              │
 *   D (0,1800) ◀── C (2400,1800)
 *
 * Wand A = oben, B = rechts, C = unten, D = links.
 * ---------------------------------------------------------------------- */

const BATHROOM: Room = {
  id: 'room_sample_bad',
  name: 'Bad',
  ceilingHeight: CEILING_HEIGHT,
  northAngle: 0,
  walls: [
    {
      id: 'wall_sample_a',
      start: { x: 0, y: 0 },
      end: { x: 2400, y: 0 },
      thickness: 115,
      openings: [
        {
          id: 'opening_sample_window',
          type: 'window',
          offset: 1500,
          width: 600,
          height: 800,
          sillHeight: 1300,
        },
      ],
    },
    {
      id: 'wall_sample_b',
      start: { x: 2400, y: 0 },
      end: { x: 2400, y: 1800 },
      thickness: 115,
      openings: [],
    },
    {
      id: 'wall_sample_c',
      start: { x: 2400, y: 1800 },
      end: { x: 0, y: 1800 },
      thickness: 240,
      openings: [
        {
          id: 'opening_sample_door',
          type: 'door',
          offset: 1600,
          width: 760,
          height: 2010,
          sillHeight: 0,
          swing: 'in-left',
        },
      ],
    },
    {
      id: 'wall_sample_d',
      start: { x: 0, y: 1800 },
      end: { x: 0, y: 0 },
      thickness: 115,
      openings: [],
    },
  ],
  fixtures: [
    {
      // Waschbecken an der oberen Wand, links.
      // Zwischen ihm und der linken Ecke bleibt bewusst eine Lücke, in die
      // ein 40-cm-Unterschrank gerade so passt — das ist die Beispielfrage
      // aus der Projektbeschreibung, hier als prüfbarer Fall hinterlegt.
      id: 'fixture_sample_washbasin',
      catalogItemId: 'catalog_builtin_washbasin_600',
      name: 'Waschbecken',
      category: 'sanitary',
      position: { x: 1000, y: 240 },
      rotation: 180,
      size: { w: 600, d: 480, h: 200 },
      mountHeight: 850,
      clearances: { front: 550, back: 0, left: 100, right: 100 },
      connections: [
        { type: 'drain', offset: { x: 0, y: 100, z: 500 } },
        { type: 'water-cold', offset: { x: -50, y: 100, z: 550 } },
        { type: 'water-hot', offset: { x: 50, y: 100, z: 550 } },
      ],
      locked: false,
    },
    {
      // Dusche in der rechten unteren Ecke.
      id: 'fixture_sample_shower',
      catalogItemId: 'catalog_builtin_shower_900',
      name: 'Dusche',
      category: 'sanitary',
      position: { x: 1950, y: 1350 },
      rotation: 0,
      size: { w: 900, d: 900, h: 2000 },
      mountHeight: 0,
      clearances: { front: 550, back: 0, left: 0, right: 0 },
      connections: [{ type: 'drain', offset: { x: 0, y: 0, z: 0 } }],
      locked: false,
    },
    {
      // Wand-WC an der linken Wand.
      id: 'fixture_sample_wc',
      catalogItemId: 'catalog_builtin_wc_wall',
      name: 'WC',
      category: 'sanitary',
      position: { x: 270, y: 1100 },
      rotation: 90,
      size: { w: 380, d: 540, h: 400 },
      mountHeight: 400,
      clearances: { front: 600, back: 0, left: 200, right: 200 },
      connections: [{ type: 'drain', offset: { x: 0, y: 150, z: 220 } }],
      locked: false,
    },
  ],
};

/**
 * Erzeugt eine frische Kopie des Beispielprojekts.
 *
 * Bewusst eine Funktion und keine Konstante: der Store mutiert zwar immutabel,
 * aber ein geteiltes Modul-Objekt würde bedeuten, dass zwei geöffnete Projekte
 * dieselben Objektreferenzen halten — und damit die Referenzvergleiche der
 * Undo-Middleware unterlaufen.
 */
export function createSampleProject(): Project {
  return structuredClone({
    id: 'project_sample',
    name: 'Beispiel: Bad',
    createdAt: '2026-01-01T00:00:00.000Z',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    floors: [
      {
        id: 'floor_sample',
        name: 'Erdgeschoss',
        rooms: [BATHROOM],
      },
    ],
    catalog: BUILTIN_CATALOG,
  } satisfies Project);
}
