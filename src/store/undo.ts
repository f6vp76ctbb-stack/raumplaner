/**
 * Undo/Redo als Zustand-Middleware.
 *
 * Bewusst kein Fremdpaket: die verbreiteten Lösungen serialisieren den halben
 * Store oder klonen tief. Wir brauchen weder das eine noch das andere, weil
 * alle Mutationen immutabel sind — ein Schnappschuss ist damit eine einzige
 * Referenz, und Undo kostet konstant Speicher pro Schritt statt einer
 * Tiefkopie des Projekts.
 *
 * Zwei Eigenschaften, die die Standardpakete nicht liefern und die dieser
 * Editor braucht:
 *
 *  1. `partialize` grenzt ein, WAS historisiert wird. Auswahl, Zoom und
 *     Werkzeugmodus liegen im selben Store, dürfen aber keinen Undo-Schritt
 *     erzeugen — sonst drückt der Nutzer dreimal Undo und hat nur die Auswahl
 *     zurückgesetzt. Da nur bei tatsächlicher Referenzänderung des
 *     partialisierten Teils aufgezeichnet wird, fällt das automatisch heraus.
 *
 *  2. Transaktionen. Ein Drag über den Canvas erzeugt pro Frame ein `set`.
 *     Ohne Klammerung wären das 60 Undo-Schritte pro Sekunde. `begin` /
 *     `commit` fasst sie zu einem einzigen Schritt zusammen.
 */

import type { StateCreator, StoreMutatorIdentifier } from 'zustand';

export interface HistoryEntry<TSnapshot> {
  snapshot: TSnapshot;
  /** Kurzlabel für die Anzeige, z. B. "Wand verschoben". */
  label: string;
}

export interface UndoApi {
  undo(): void;
  redo(): void;
  canUndo(): boolean;
  canRedo(): boolean;
  /** Label des Schritts, den `undo()` rückgängig machen würde. */
  undoLabel(): string | null;
  redoLabel(): string | null;
  clearHistory(): void;
  /**
   * Klammert mehrere Änderungen zu einem Undo-Schritt.
   * Verschachtelung wird gezählt; erst das äußerste `commit` schließt ab.
   */
  beginTransaction(label: string): void;
  commitTransaction(): void;
  /** Bricht die Transaktion ab und stellt den Stand vor `begin` wieder her. */
  abortTransaction(): void;
  /** Führt `fn` in einer Transaktion aus und committet auch bei Wurf sauber. */
  transact<T>(label: string, fn: () => T): T;
}

export interface UndoOptions<TState, TSnapshot> {
  /** Der historisierte Ausschnitt des States. */
  partialize: (state: TState) => TSnapshot;
  /** Schreibt einen Schnappschuss zurück in den State. */
  merge: (state: TState, snapshot: TSnapshot) => TState;
  /**
   * Maximale Schrittzahl. Die Vorgabe lautet "Undo über die gesamte Session",
   * eine Obergrenze ist trotzdem nötig, damit ein langer Arbeitstag den
   * Speicher nicht unbegrenzt füllt. 500 Schritte sind für Grundrissarbeit
   * praktisch unbegrenzt und kosten nur Referenzen.
   */
  limit?: number;
  /** Label, wenn ein `set` ohne Angabe erfolgt. */
  defaultLabel?: string;
}

/** Zusätzliches drittes Argument von `set`, um einen Schritt zu benennen. */
export interface SetMeta {
  label?: string;
  /** Diese Änderung erzeugt keinen Undo-Schritt (z. B. Laden von Platte). */
  silent?: boolean;
}

interface UndoInternals<TSnapshot> {
  past: HistoryEntry<TSnapshot>[];
  future: HistoryEntry<TSnapshot>[];
  transactionDepth: number;
  /** Schnappschuss beim Öffnen der äußersten Transaktion. */
  transactionBase: HistoryEntry<TSnapshot> | null;
  /** Unterdrückt Aufzeichnung, während undo/redo selbst schreibt. */
  applying: boolean;
}

/**
 * Erzeugt die Middleware.
 *
 * Bewusst nicht als Zustand-Mutator typisiert: die offizielle
 * `StoreMutatorIdentifier`-Registrierung erfordert eine Modulerweiterung und
 * bringt hier keinen Gewinn, weil der Store die `UndoApi` ohnehin explizit in
 * seinem eigenen Interface führt. Der Preis wäre eine Menge Typ-Zeremonie für
 * null zusätzliche Sicherheit.
 */
export function createUndoMiddleware<TState extends object, TSnapshot>(
  options: UndoOptions<TState, TSnapshot>,
) {
  const { partialize, merge, limit = 500, defaultLabel = 'Änderung' } = options;

  const internals: UndoInternals<TSnapshot> = {
    past: [],
    future: [],
    transactionDepth: 0,
    transactionBase: null,
    applying: false,
  };

  return function undoMiddleware<
    Mps extends [StoreMutatorIdentifier, unknown][] = [],
    Mcs extends [StoreMutatorIdentifier, unknown][] = [],
  >(
    initializer: StateCreator<TState, Mps, Mcs>,
  ): StateCreator<TState, Mps, Mcs> {
    return ((set, get, store) => {
      const rawSet = set as unknown as (
        partial: Partial<TState> | ((state: TState) => Partial<TState>),
        replace?: false,
      ) => void;

      /** Label der offenen Transaktion; gewinnt gegen die Labels der Einzel-Sets. */
      let pendingLabel: string | null = null;

      const trackedSet = (
        partial: Partial<TState> | ((state: TState) => Partial<TState>),
        replace?: false,
        meta?: SetMeta,
      ) => {
        if (meta?.silent || internals.applying) {
          rawSet(partial, replace);
          return;
        }

        const before = partialize(get() as TState);
        // Kandidat für die Historie wird VOR der Änderung gebildet, aber erst
        // eingetragen, wenn die Änderung den historisierten Teil wirklich
        // berührt hat. Referenzvergleich reicht, weil alle Mutationen neue
        // Objekte erzeugen.
        rawSet(partial, replace);
        const after = partialize(get() as TState);

        if (before === after) return;

        if (internals.transactionDepth > 0) {
          internals.transactionBase ??= { snapshot: before, label: meta?.label ?? defaultLabel };
          return;
        }

        internals.past.push({ snapshot: before, label: meta?.label ?? defaultLabel });
        if (internals.past.length > limit) internals.past.shift();
        internals.future.length = 0;
      };

      const applySnapshot = (snapshot: TSnapshot) => {
        internals.applying = true;
        try {
          rawSet((state) => merge(state, snapshot) as Partial<TState>);
        } finally {
          internals.applying = false;
        }
      };

      const api: UndoApi = {
        canUndo: () => internals.past.length > 0,
        canRedo: () => internals.future.length > 0,
        undoLabel: () => internals.past.at(-1)?.label ?? null,
        redoLabel: () => internals.future.at(-1)?.label ?? null,

        undo() {
          const entry = internals.past.pop();
          if (!entry) return;
          internals.future.push({
            snapshot: partialize(get() as TState),
            label: entry.label,
          });
          applySnapshot(entry.snapshot);
        },

        redo() {
          const entry = internals.future.pop();
          if (!entry) return;
          internals.past.push({
            snapshot: partialize(get() as TState),
            label: entry.label,
          });
          applySnapshot(entry.snapshot);
        },

        clearHistory() {
          internals.past.length = 0;
          internals.future.length = 0;
          internals.transactionDepth = 0;
          internals.transactionBase = null;
        },

        beginTransaction(label: string) {
          if (internals.transactionDepth === 0) {
            internals.transactionBase = null;
            pendingLabel = label;
          }
          internals.transactionDepth += 1;
        },

        commitTransaction() {
          if (internals.transactionDepth === 0) return;
          internals.transactionDepth -= 1;
          if (internals.transactionDepth > 0) return;

          const base = internals.transactionBase;
          internals.transactionBase = null;
          // Keine Änderung während der Transaktion: kein Undo-Schritt.
          if (!base) return;

          internals.past.push({ snapshot: base.snapshot, label: pendingLabel ?? base.label });
          if (internals.past.length > limit) internals.past.shift();
          internals.future.length = 0;
          pendingLabel = null;
        },

        abortTransaction() {
          if (internals.transactionDepth === 0) return;
          internals.transactionDepth = 0;
          const base = internals.transactionBase;
          internals.transactionBase = null;
          pendingLabel = null;
          if (base) applySnapshot(base.snapshot);
        },

        transact(label, fn) {
          api.beginTransaction(label);
          try {
            const result = fn();
            api.commitTransaction();
            return result;
          } catch (error) {
            api.abortTransaction();
            throw error;
          }
        },
      };

      undoApiRegistry.set(store, api);

      return initializer(trackedSet as typeof set, get, store);
    }) as StateCreator<TState, Mps, Mcs>;
  };
}

/**
 * Verknüpft eine Store-Instanz mit ihrer Undo-API.
 *
 * Alternative wäre, die API in den State zu legen — dann würde aber jede
 * Undo-Operation eine Zustandsänderung auslösen und alle Abonnenten wecken,
 * obwohl sich fachlich nichts geändert hat.
 */
const undoApiRegistry = new WeakMap<object, UndoApi>();

export function getUndoApi(store: object): UndoApi {
  const api = undoApiRegistry.get(store);
  if (!api) {
    throw new Error('Für diesen Store ist keine Undo-Middleware registriert.');
  }
  return api;
}
