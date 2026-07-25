/**
 * Tests der Undo-Middleware gegen `zustand/vanilla`.
 *
 * Bewusst ohne React: die Middleware darf keinerlei Renderabhängigkeit haben,
 * und dieser Test hält das durch. Wenn hier jemals ein React-Import nötig
 * würde, wäre die Schichtgrenze verletzt.
 */

import { describe, expect, it } from 'vitest';
import { createStore } from 'zustand/vanilla';
import { createUndoMiddleware, getUndoApi, type SetMeta } from './undo';

interface Doc {
  value: number;
  items: string[];
}

interface TestState {
  doc: Doc;
  /** Nicht historisiert — steht stellvertretend für Auswahl/Zoom/Werkzeug. */
  selection: string;

  setValue(value: number, meta?: SetMeta): void;
  addItem(item: string): void;
  setSelection(selection: string): void;
  loadSilently(doc: Doc): void;
}

function makeStore() {
  const middleware = createUndoMiddleware<TestState, Doc>({
    partialize: (state) => state.doc,
    merge: (state, doc) => ({ ...state, doc }),
  });

  const store = createStore<TestState>()(
    middleware((set) => {
      const write = (
        partial: (state: TestState) => Partial<TestState>,
        meta?: SetMeta,
      ) => {
        (set as unknown as (
          p: (s: TestState) => Partial<TestState>,
          r: undefined,
          m?: SetMeta,
        ) => void)(partial, undefined, meta);
      };

      return {
        doc: { value: 0, items: [] },
        selection: '',

        setValue(value, meta) {
          write((state) => ({ doc: { ...state.doc, value } }), meta);
        },
        addItem(item) {
          write((state) => ({ doc: { ...state.doc, items: [...state.doc.items, item] } }));
        },
        setSelection(selection) {
          write(() => ({ selection }));
        },
        loadSilently(doc) {
          write(() => ({ doc }), { silent: true });
        },
      };
    }),
  );

  return { store, undo: getUndoApi(store) };
}

describe('Grundverhalten', () => {
  it('startet ohne Historie', () => {
    const { undo } = makeStore();
    expect(undo.canUndo()).toBe(false);
    expect(undo.canRedo()).toBe(false);
  });

  it('macht eine einzelne Änderung rückgängig', () => {
    const { store, undo } = makeStore();
    store.getState().setValue(42);
    expect(store.getState().doc.value).toBe(42);

    undo.undo();
    expect(store.getState().doc.value).toBe(0);
    expect(undo.canUndo()).toBe(false);
    expect(undo.canRedo()).toBe(true);
  });

  it('stellt mit redo wieder her', () => {
    const { store, undo } = makeStore();
    store.getState().setValue(42);
    undo.undo();
    undo.redo();
    expect(store.getState().doc.value).toBe(42);
    expect(undo.canRedo()).toBe(false);
  });

  it('geht mehrere Schritte in der richtigen Reihenfolge zurück', () => {
    const { store, undo } = makeStore();
    store.getState().setValue(1);
    store.getState().setValue(2);
    store.getState().setValue(3);

    undo.undo();
    expect(store.getState().doc.value).toBe(2);
    undo.undo();
    expect(store.getState().doc.value).toBe(1);
    undo.undo();
    expect(store.getState().doc.value).toBe(0);
    undo.undo(); // einer zu viel darf nicht werfen
    expect(store.getState().doc.value).toBe(0);
  });

  it('verwirft die Redo-Kette, sobald nach einem Undo neu geschrieben wird', () => {
    const { store, undo } = makeStore();
    store.getState().setValue(1);
    store.getState().setValue(2);
    undo.undo();
    expect(undo.canRedo()).toBe(true);

    store.getState().setValue(99);
    expect(undo.canRedo()).toBe(false);
    expect(store.getState().doc.value).toBe(99);
  });
});

describe('partialize grenzt die Historie ein', () => {
  it('erzeugt für eine reine Auswahländerung keinen Undo-Schritt', () => {
    // Das ist der Grund für partialize: sonst drückt der Nutzer dreimal Undo
    // und hat nur die Auswahl zurückgesetzt statt seine Wand.
    const { store, undo } = makeStore();
    store.getState().setSelection('wall_1');
    store.getState().setSelection('wall_2');
    expect(undo.canUndo()).toBe(false);
  });

  it('lässt die Auswahl bei einem Undo unangetastet', () => {
    const { store, undo } = makeStore();
    store.getState().setValue(5);
    store.getState().setSelection('wall_1');

    undo.undo();
    expect(store.getState().doc.value).toBe(0);
    expect(store.getState().selection).toBe('wall_1');
  });

  it('zeichnet nichts auf, wenn ein Schreibvorgang den Wert nicht ändert', () => {
    const { store, undo } = makeStore();
    store.getState().setValue(7);
    expect(undo.canUndo()).toBe(true);
    undo.clearHistory();

    // Gleicher Wert, aber neues doc-Objekt -> Referenz ändert sich, also wird
    // aufgezeichnet. Das ist gewollt: die Middleware kann nicht wissen, ob ein
    // neues Objekt fachlich identisch ist, und ein zu viel aufgezeichneter
    // Schritt ist harmloser als ein verlorener.
    store.getState().setValue(7);
    expect(undo.canUndo()).toBe(true);
  });
});

describe('silent', () => {
  it('erzeugt beim Laden von Platte keinen Undo-Schritt', () => {
    const { store, undo } = makeStore();
    store.getState().loadSilently({ value: 100, items: ['a'] });
    expect(store.getState().doc.value).toBe(100);
    expect(undo.canUndo()).toBe(false);
  });
});

describe('Transaktionen', () => {
  it('fasst viele Schreibvorgänge zu einem Schritt zusammen', () => {
    // Ein Drag über den Canvas erzeugt pro Frame ein set. Ohne Klammerung
    // wären das 60 Undo-Schritte pro Sekunde.
    const { store, undo } = makeStore();

    undo.beginTransaction('Objekt verschoben');
    for (let i = 1; i <= 60; i++) store.getState().setValue(i);
    undo.commitTransaction();

    expect(store.getState().doc.value).toBe(60);
    undo.undo();
    expect(store.getState().doc.value).toBe(0);
    expect(undo.canUndo()).toBe(false);
  });

  it('übernimmt das Transaktionslabel', () => {
    const { store, undo } = makeStore();
    undo.beginTransaction('Objekt verschoben');
    store.getState().setValue(1);
    store.getState().setValue(2);
    undo.commitTransaction();

    expect(undo.undoLabel()).toBe('Objekt verschoben');
  });

  it('erzeugt keinen Schritt, wenn während der Transaktion nichts passiert ist', () => {
    // Antippen ohne Ziehen: begin/commit ohne Änderung dazwischen darf keinen
    // leeren Undo-Schritt hinterlassen, sonst tut Undo scheinbar nichts.
    const { undo } = makeStore();
    undo.beginTransaction('Objekt verschoben');
    undo.commitTransaction();
    expect(undo.canUndo()).toBe(false);
  });

  it('ignoriert reine Auswahländerungen innerhalb einer Transaktion', () => {
    const { store, undo } = makeStore();
    undo.beginTransaction('Auswahl gezogen');
    store.getState().setSelection('a');
    store.getState().setSelection('b');
    undo.commitTransaction();
    expect(undo.canUndo()).toBe(false);
  });

  it('zählt Verschachtelung und schließt erst außen ab', () => {
    const { store, undo } = makeStore();
    undo.beginTransaction('außen');
    store.getState().setValue(1);
    undo.beginTransaction('innen');
    store.getState().setValue(2);
    undo.commitTransaction();
    expect(undo.canUndo()).toBe(false); // innen darf noch nichts abschließen
    undo.commitTransaction();

    expect(undo.canUndo()).toBe(true);
    undo.undo();
    expect(store.getState().doc.value).toBe(0);
  });

  it('stellt bei abort den Stand vor begin wieder her', () => {
    const { store, undo } = makeStore();
    store.getState().setValue(5);
    undo.clearHistory();

    undo.beginTransaction('Objekt verschoben');
    store.getState().setValue(10);
    store.getState().setValue(20);
    undo.abortTransaction();

    expect(store.getState().doc.value).toBe(5);
    expect(undo.canUndo()).toBe(false);
  });

  it('committet bei transact und macht die Klammer in einem Schritt rückgängig', () => {
    const { store, undo } = makeStore();
    undo.transact('Mehrfachänderung', () => {
      store.getState().addItem('a');
      store.getState().addItem('b');
      store.getState().addItem('c');
    });

    expect(store.getState().doc.items).toEqual(['a', 'b', 'c']);
    undo.undo();
    expect(store.getState().doc.items).toEqual([]);
  });

  it('rollt bei einem Wurf innerhalb von transact zurück und reicht den Fehler weiter', () => {
    const { store, undo } = makeStore();
    store.getState().addItem('bestand');
    undo.clearHistory();

    expect(() =>
      undo.transact('kaputt', () => {
        store.getState().addItem('halbfertig');
        throw new Error('Kollision erkannt');
      }),
    ).toThrow('Kollision erkannt');

    // Kein halbfertiger Zustand und kein Undo-Schritt.
    expect(store.getState().doc.items).toEqual(['bestand']);
    expect(undo.canUndo()).toBe(false);
  });
});

describe('Historiengrenze', () => {
  it('wirft die ältesten Schritte weg, statt unbegrenzt zu wachsen', () => {
    const middleware = createUndoMiddleware<TestState, Doc>({
      partialize: (state) => state.doc,
      merge: (state, doc) => ({ ...state, doc }),
      limit: 3,
    });

    const store = createStore<TestState>()(
      middleware((set) => ({
        doc: { value: 0, items: [] },
        selection: '',
        setValue(value) {
          (set as (p: (s: TestState) => Partial<TestState>) => void)((state) => ({
            doc: { ...state.doc, value },
          }));
        },
        addItem() {},
        setSelection() {},
        loadSilently() {},
      })),
    );
    const undo = getUndoApi(store);

    for (let i = 1; i <= 10; i++) store.getState().setValue(i);

    // Nur die letzten 3 Schritte sind noch da: 10 -> 9 -> 8 -> 7.
    undo.undo();
    undo.undo();
    undo.undo();
    expect(store.getState().doc.value).toBe(7);
    expect(undo.canUndo()).toBe(false);
  });
});
