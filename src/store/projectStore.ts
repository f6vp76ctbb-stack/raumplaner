/**
 * Zentraler Projekt-Store.
 *
 * Aufbau-Regel: alle Mutationen sind immutabel und erzeugen für JEDEN
 * geänderten Knoten auf dem Pfad ein neues Objekt. Daran hängen zwei Dinge —
 * die Referenzvergleiche der Undo-Middleware und das selektive Neuzeichnen
 * des Canvas. Eine In-Place-Mutation bricht beides lautlos.
 *
 * Der Store hält NUR den Zustand. Jede abgeleitete Größe (Flächen, Lücken,
 * Kollisionen) wird in `src/engine` berechnet und nie hier abgelegt.
 */

import { create } from 'zustand';
import type {
  CatalogItem,
  Fixture,
  Floor,
  Opening,
  Project,
  Room,
  Wall,
} from '../model/types';
import { CURRENT_SCHEMA_VERSION } from '../model/types';
import { makeId } from '../model/ids';
import { createUndoMiddleware, getUndoApi, type SetMeta, type UndoApi } from './undo';

/** Was auf dem Canvas ausgewählt ist. Nicht Teil der Undo-Historie. */
export interface Selection {
  kind: 'none' | 'wall' | 'fixture' | 'opening';
  ids: string[];
}

const EMPTY_SELECTION: Selection = { kind: 'none', ids: [] };

export interface ProjectState {
  /** `null`, solange nichts geladen ist. */
  project: Project | null;

  activeFloorId: string | null;
  activeRoomId: string | null;
  selection: Selection;
  /** Ungespeicherte Änderungen seit dem letzten Schreiben auf Platte. */
  dirty: boolean;

  // -- Projektebene ------------------------------------------------------
  loadProject(project: Project): void;
  closeProject(): void;
  renameProject(name: string): void;
  markSaved(): void;

  // -- Navigation und Auswahl (nicht undoable) ---------------------------
  setActiveRoom(floorId: string, roomId: string): void;
  select(kind: Selection['kind'], ids: string[]): void;
  clearSelection(): void;

  // -- Räume -------------------------------------------------------------
  addRoom(floorId: string, room: Room): void;
  updateRoom(roomId: string, patch: Partial<Omit<Room, 'id'>>): void;
  removeRoom(roomId: string): void;

  // -- Wände -------------------------------------------------------------
  updateWall(roomId: string, wallId: string, patch: Partial<Omit<Wall, 'id'>>): void;
  addOpening(roomId: string, wallId: string, opening: Opening): void;
  updateOpening(
    roomId: string,
    wallId: string,
    openingId: string,
    patch: Partial<Omit<Opening, 'id'>>,
  ): void;
  removeOpening(roomId: string, wallId: string, openingId: string): void;

  // -- Objekte -----------------------------------------------------------
  addFixture(roomId: string, fixture: Fixture): void;
  updateFixture(roomId: string, fixtureId: string, patch: Partial<Omit<Fixture, 'id'>>): void;
  removeFixture(roomId: string, fixtureId: string): void;

  // -- Katalog -----------------------------------------------------------
  addCatalogItem(item: CatalogItem): void;
  removeCatalogItem(itemId: string): void;
}

/* -------------------------------------------------------------------------
 * Immutable Helfer
 *
 * Bewusst als freie Funktionen statt einer Immer-Abhängigkeit: die Pfade sind
 * flach und wenige, und Immer würde zwischen Store und Canvas Proxy-Objekte
 * einziehen, deren Identität sich anders verhält als erwartet.
 * ---------------------------------------------------------------------- */

function replaceById<T extends { id: string }>(items: T[], id: string, next: (item: T) => T): T[] {
  let changed = false;
  const result = items.map((item) => {
    if (item.id !== id) return item;
    changed = true;
    return next(item);
  });
  return changed ? result : items;
}

/** Wendet `next` auf den Raum mit `roomId` an, über alle Etagen hinweg. */
function mapRoom(project: Project, roomId: string, next: (room: Room) => Room): Project {
  let changed = false;

  const floors: Floor[] = project.floors.map((floor) => {
    const rooms = replaceById(floor.rooms, roomId, (room) => {
      changed = true;
      return next(room);
    });
    return rooms === floor.rooms ? floor : { ...floor, rooms };
  });

  return changed ? { ...project, floors } : project;
}

function mapWall(room: Room, wallId: string, next: (wall: Wall) => Wall): Room {
  const walls = replaceById(room.walls, wallId, next);
  return walls === room.walls ? room : { ...room, walls };
}

/* -------------------------------------------------------------------------
 * Store
 * ---------------------------------------------------------------------- */

const undoMiddleware = createUndoMiddleware<ProjectState, Project | null>({
  // Nur das Projekt ist historisiert. Auswahl, aktiver Raum und das
  // dirty-Flag ändern sich beim Navigieren ständig und dürfen keinen
  // Undo-Schritt erzeugen.
  partialize: (state) => state.project,
  merge: (state, project) => ({ ...state, project, dirty: true }),
  defaultLabel: 'Änderung',
});

export const useProjectStore = create<ProjectState>()(
  undoMiddleware((set, get) => {
    /** `set` mit Undo-Label. */
    const edit = (
      label: string,
      updater: (state: ProjectState) => Partial<ProjectState>,
    ) => {
      (set as unknown as (
        partial: (state: ProjectState) => Partial<ProjectState>,
        replace: undefined,
        meta: SetMeta,
      ) => void)(
        (state) => {
          const patch = updater(state);
          return patch.project === state.project ? patch : { ...patch, dirty: true };
        },
        undefined,
        { label },
      );
    };

    /** `set`, das keinen Undo-Schritt erzeugt (Navigation, Laden, Speichern). */
    const quiet = (updater: (state: ProjectState) => Partial<ProjectState>) => {
      (set as unknown as (
        partial: (state: ProjectState) => Partial<ProjectState>,
        replace: undefined,
        meta: SetMeta,
      ) => void)(updater, undefined, { silent: true });
    };

    /** Bequemer Zugriff: Mutation auf dem aktuell geladenen Projekt. */
    const editProject = (label: string, next: (project: Project) => Project) => {
      edit(label, (state) =>
        state.project ? { project: next(state.project) } : {},
      );
    };

    return {
      project: null,
      activeFloorId: null,
      activeRoomId: null,
      selection: EMPTY_SELECTION,
      dirty: false,

      loadProject(project) {
        const firstFloor = project.floors[0] ?? null;
        const firstRoom = firstFloor?.rooms[0] ?? null;
        quiet(() => ({
          project,
          activeFloorId: firstFloor?.id ?? null,
          activeRoomId: firstRoom?.id ?? null,
          selection: EMPTY_SELECTION,
          dirty: false,
        }));
        getUndoApi(useProjectStore).clearHistory();
      },

      closeProject() {
        quiet(() => ({
          project: null,
          activeFloorId: null,
          activeRoomId: null,
          selection: EMPTY_SELECTION,
          dirty: false,
        }));
        getUndoApi(useProjectStore).clearHistory();
      },

      renameProject(name) {
        editProject('Projekt umbenannt', (project) => ({ ...project, name }));
      },

      markSaved() {
        quiet(() => ({ dirty: false }));
      },

      setActiveRoom(floorId, roomId) {
        quiet(() => ({
          activeFloorId: floorId,
          activeRoomId: roomId,
          selection: EMPTY_SELECTION,
        }));
      },

      select(kind, ids) {
        quiet(() => ({ selection: { kind, ids } }));
      },

      clearSelection() {
        quiet(() => ({ selection: EMPTY_SELECTION }));
      },

      addRoom(floorId, room) {
        editProject('Raum hinzugefügt', (project) => ({
          ...project,
          floors: replaceById(project.floors, floorId, (floor) => ({
            ...floor,
            rooms: [...floor.rooms, room],
          })),
        }));
      },

      updateRoom(roomId, patch) {
        editProject('Raum geändert', (project) =>
          mapRoom(project, roomId, (room) => ({ ...room, ...patch })),
        );
      },

      removeRoom(roomId) {
        editProject('Raum gelöscht', (project) => ({
          ...project,
          floors: project.floors.map((floor) => {
            const rooms = floor.rooms.filter((room) => room.id !== roomId);
            return rooms.length === floor.rooms.length ? floor : { ...floor, rooms };
          }),
        }));
        if (get().activeRoomId === roomId) {
          quiet(() => ({ activeRoomId: null, selection: EMPTY_SELECTION }));
        }
      },

      updateWall(roomId, wallId, patch) {
        editProject('Wand geändert', (project) =>
          mapRoom(project, roomId, (room) =>
            mapWall(room, wallId, (wall) => ({ ...wall, ...patch })),
          ),
        );
      },

      addOpening(roomId, wallId, opening) {
        editProject('Öffnung gesetzt', (project) =>
          mapRoom(project, roomId, (room) =>
            mapWall(room, wallId, (wall) => ({
              ...wall,
              openings: [...wall.openings, opening],
            })),
          ),
        );
      },

      updateOpening(roomId, wallId, openingId, patch) {
        editProject('Öffnung geändert', (project) =>
          mapRoom(project, roomId, (room) =>
            mapWall(room, wallId, (wall) => ({
              ...wall,
              openings: replaceById(wall.openings, openingId, (opening) => ({
                ...opening,
                ...patch,
              })),
            })),
          ),
        );
      },

      removeOpening(roomId, wallId, openingId) {
        editProject('Öffnung gelöscht', (project) =>
          mapRoom(project, roomId, (room) =>
            mapWall(room, wallId, (wall) => ({
              ...wall,
              openings: wall.openings.filter((opening) => opening.id !== openingId),
            })),
          ),
        );
      },

      addFixture(roomId, fixture) {
        editProject('Objekt platziert', (project) =>
          mapRoom(project, roomId, (room) => ({
            ...room,
            fixtures: [...room.fixtures, fixture],
          })),
        );
      },

      updateFixture(roomId, fixtureId, patch) {
        editProject('Objekt geändert', (project) =>
          mapRoom(project, roomId, (room) => ({
            ...room,
            fixtures: replaceById(room.fixtures, fixtureId, (fixture) =>
              // Gesperrte Objekte ignorieren Änderungen still. Der Aufrufer
              // muss vorher prüfen, wenn er dem Nutzer etwas melden will.
              fixture.locked ? fixture : { ...fixture, ...patch },
            ),
          })),
        );
      },

      removeFixture(roomId, fixtureId) {
        editProject('Objekt gelöscht', (project) =>
          mapRoom(project, roomId, (room) => ({
            ...room,
            fixtures: room.fixtures.filter((fixture) => fixture.id !== fixtureId),
          })),
        );
      },

      addCatalogItem(item) {
        editProject('Katalogeintrag hinzugefügt', (project) => ({
          ...project,
          catalog: [...project.catalog, item],
        }));
      },

      removeCatalogItem(itemId) {
        editProject('Katalogeintrag entfernt', (project) => ({
          ...project,
          catalog: project.catalog.filter((item) => item.id !== itemId),
        }));
      },
    };
  }),
);

/** Undo/Redo-API des Projekt-Stores. */
export const projectUndo: UndoApi = getUndoApi(useProjectStore);

/** Legt ein leeres Projekt mit einer Etage an. */
export function createEmptyProject(name: string): Project {
  return {
    id: makeId('project'),
    name,
    createdAt: new Date().toISOString(),
    schemaVersion: CURRENT_SCHEMA_VERSION,
    floors: [{ id: makeId('floor'), name: 'Erdgeschoss', rooms: [] }],
    catalog: [],
  };
}
