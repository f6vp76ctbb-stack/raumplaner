/**
 * Domänenmodell des Raumplaners.
 *
 * Diese Datei ist rein: keine React-, React-Native- oder Expo-Importe.
 * Sie muss in einem nackten Node-Prozess ladbar bleiben.
 *
 * ---------------------------------------------------------------------------
 * KONVENTIONEN — verbindlich für Engine, Store, Editor und Export
 * ---------------------------------------------------------------------------
 *
 * EINHEIT
 *   Alle Längen sind Millimeter als Integer (`Mm`). Es gibt keine Fließkomma-
 *   Maße im persistierten Zustand. Die Engine rechnet intern in Double und
 *   rundet ausschließlich an der Store-Grenze (siehe `roundMm`).
 *
 * KOORDINATENSYSTEM
 *   x zeigt nach rechts, y zeigt nach UNTEN (Bildschirmkonvention).
 *   Damit entfällt ein Achsen-Flip zwischen Modell und Skia-Canvas.
 *   Ein Raumpolygon ist im Uhrzeigersinn definiert — auf dem Bildschirm
 *   gesehen. Bei y-nach-unten ergibt die Shoelace-Formel dafür eine
 *   POSITIVE Fläche; die Engine assertiert das (`assertClockwise`).
 *
 * WANDBEZUG
 *   `Wall.start` / `Wall.end` beschreiben die INNENKANTE der Wand, also die
 *   Fläche, die man im Raum sieht und mit dem Laser-Entfernungsmesser misst.
 *   `thickness` wächst von dort nach AUSSEN, aus dem Raum heraus.
 *   Begründung: die Zahl, die der Nutzer eingibt ("2340"), ist damit direkt
 *   die gespeicherte Zahl — keine Rückrechnung, keine Rundungsdrift.
 *   Folge: `Room` ist ein eigenständiges Polygon; benachbarte Räume teilen
 *   sich keine Wand (bewusste Entscheidung für 1.0).
 *
 * ROTATION
 *   `Fixture.rotation` ist ein Integer in Grad, im Uhrzeigersinn positiv.
 *   0° = Front des Objekts zeigt nach -Y (im Bild nach oben).
 *   Rotierte Eckpunkte werden NIE persistiert, sondern immer aus
 *   (position, size, rotation) neu berechnet. Damit ist Drift durch
 *   wiederholtes Drehen strukturell ausgeschlossen.
 *
 * ÖFFNUNGEN
 *   `Opening.offset` ist der Abstand von `Wall.start` zur LINKEN KANTE der
 *   Öffnung, gemessen entlang der Wand in Richtung start→end.
 *   Begründung: das ist das Maß, das man vor Ort nimmt (Ecke bis Laibung).
 *
 * HIMMELSRICHTUNGEN
 *   Es gibt keine implizite Nordrichtung. Der Markdown-Export benennt Wände
 *   standardmäßig als "Wand A", "Wand B", … in Polygonreihenfolge.
 *   Nur wenn `Room.northAngle` gesetzt ist, werden zusätzlich Himmels-
 *   richtungen ausgegeben. Lieber kein Kompass als ein falscher.
 */

/** Länge in Millimetern. Immer Integer im persistierten Zustand. */
export type Mm = number;

/** Punkt in Raumkoordinaten. x rechts, y unten. */
export interface Point {
  x: Mm;
  y: Mm;
}

/** Aktuelle Schemaversion. Bei jeder inkompatiblen Änderung erhöhen. */
export const CURRENT_SCHEMA_VERSION = 1;

export interface Project {
  id: string;
  name: string;
  createdAt: string;
  schemaVersion: number;
  floors: Floor[];
  /**
   * In das Projekt eingebetteter Katalog-Snapshot.
   *
   * Bewusste Redundanz: die App führt zusätzlich eine globale Katalog-
   * bibliothek in SQLite (siehe src/db). Beim Platzieren eines Objekts wird
   * der zugehörige `CatalogItem` in dieses Array kopiert, damit eine
   * exportierte `.roomplan`-Datei selbsttragend und verlustfrei ist — sie
   * lässt sich auf einem fremden Gerät ohne dessen Bibliothek öffnen.
   */
  catalog: CatalogItem[];
}

export interface Floor {
  id: string;
  name: string;
  rooms: Room[];
}

export interface Room {
  id: string;
  name: string;
  ceilingHeight: Mm;
  /** Geschlossenes Polygon im Uhrzeigersinn. walls[i].end === walls[i+1].start. */
  walls: Wall[];
  fixtures: Fixture[];
  /**
   * Optional: Drehung der Nordrichtung in Grad im Uhrzeigersinn, 0 = Norden
   * zeigt nach -Y. Nur gesetzt, wenn der Nutzer die Ausrichtung angegeben hat.
   * Ohne diesen Wert gibt der Export keine Himmelsrichtungen aus.
   */
  northAngle?: number;
}

export interface Wall {
  id: string;
  /** Innenkante, Startpunkt. */
  start: Point;
  /** Innenkante, Endpunkt. Identisch mit dem `start` der Folgewand. */
  end: Point;
  /** Wandstärke; wächst von der Innenkante nach außen. */
  thickness: Mm;
  openings: Opening[];
}

export type OpeningType = 'door' | 'window' | 'passage' | 'niche';

export interface Opening {
  id: string;
  type: OpeningType;
  /** Abstand von Wall.start zur linken Kante der Öffnung, entlang der Wand. */
  offset: Mm;
  width: Mm;
  height: Mm;
  /** Brüstungshöhe über Fertigfußboden. Bei Tür und Durchgang 0. */
  sillHeight: Mm;
  /**
   * ERGÄNZUNG gegenüber der Ursprungsspezifikation.
   * Tiefe der Aussparung in die Wand hinein. Nur bei `type: 'niche'`
   * relevant und dort Pflicht — ohne diesen Wert lässt sich eine Nische
   * weder in 3D aussparen noch in der nutzbaren Tiefe der Lückenberechnung
   * berücksichtigen, und genau dafür trägt man sie ein.
   */
  depth?: Mm;
  swing?: DoorSwing;
}

export type DoorSwing =
  | 'in-left'
  | 'in-right'
  | 'out-left'
  | 'out-right'
  | 'sliding';

/**
 * Hinweis zu 'door' und 'window':
 * Wanddurchbrüche werden AUSSCHLIESSLICH als `Opening` an der jeweiligen Wand
 * modelliert — das ist die einzige Wahrheit. Diese beiden Kategorien bleiben
 * in der Union erhalten (sie sind Teil des Exportvertrags) und sind für
 * freistehende Objekte reserviert, etwa eine Schiebetür vor einer Nische.
 * Die Engine liest Durchbrüche nie aus Fixtures.
 */
export type FixtureCategory =
  | 'sanitary'
  | 'furniture'
  | 'appliance'
  | 'door'
  | 'window'
  | 'radiator'
  | 'outlet'
  | 'custom';

export interface Clearances {
  front: Mm;
  back: Mm;
  left: Mm;
  right: Mm;
}

export type ConnectionType =
  | 'drain'
  | 'water-hot'
  | 'water-cold'
  | 'power'
  | 'exhaust'
  | 'antenna';

export interface Connection {
  type: ConnectionType;
  /**
   * Position im objektlokalen Koordinatensystem, vor Rotation:
   * Ursprung ist der Mittelpunkt der Grundfläche auf Höhe des Fertigfußbodens.
   * x nach rechts, y nach unten (Objektfront zeigt nach -y), z nach oben.
   */
  offset: { x: Mm; y: Mm; z: Mm };
  note?: string;
}

export interface Fixture {
  id: string;
  catalogItemId: string | null;
  name: string;
  category: FixtureCategory;
  /** Mittelpunkt der Grundfläche in Raumkoordinaten. */
  position: Point;
  /** Grad im Uhrzeigersinn, Integer. 0 = Front zeigt nach -Y. */
  rotation: number;
  /** w = Breite (lokal x), d = Tiefe (lokal y), h = Höhe (lokal z). */
  size: { w: Mm; d: Mm; h: Mm };
  /** Unterkante über Fertigfußboden. 0 = steht auf dem Boden. */
  mountHeight: Mm;
  /** Benötigter Freiraum, im objektlokalen System vor Rotation. */
  clearances: Clearances;
  connections?: Connection[];
  locked: boolean;
}

export type CatalogSource = 'builtin' | 'manual' | 'import';

export interface CatalogItem {
  id: string;
  name: string;
  manufacturer?: string;
  category: FixtureCategory;
  size: { w: Mm; d: Mm; h: Mm };
  defaultMountHeight: Mm;
  clearances: Clearances;
  connections?: Connection[];
  source: CatalogSource;
  notes?: string;
}
