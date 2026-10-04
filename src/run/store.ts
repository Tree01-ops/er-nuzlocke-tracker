// Holds all saved runs, persists them to localStorage, and notifies subscribers.
// Framework-free; the UI reads it through useSyncExternalStore.

import { normalizeRun } from "./codec.ts";
import type { Run } from "./model.ts";

const KEY = "er-nuzlocke.runs.v1";

export type RunsState = {
  runs: Run[];
  activeId: string | null;
  /** False when the browser refused storage; runs then live only until the tab closes. */
  persistent: boolean;
};

function read(): RunsState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { runs: [], activeId: null, persistent: true };
    const saved = JSON.parse(raw) as { runs?: Run[]; activeId?: string | null };
    const runs = (Array.isArray(saved.runs) ? saved.runs : []).flatMap((r) => {
      try {
        return [normalizeRun(r)];
      } catch {
        return [];
      }
    });
    const activeId = runs.some((r) => r.id === saved.activeId) ? saved.activeId! : (runs[0]?.id ?? null);
    return { runs, activeId, persistent: true };
  } catch {
    return { runs: [], activeId: null, persistent: false };
  }
}

let state: RunsState = read();
const listeners = new Set<() => void>();

function commit(next: Omit<RunsState, "persistent">) {
  let persistent = true;
  try {
    localStorage.setItem(KEY, JSON.stringify({ runs: next.runs, activeId: next.activeId }));
  } catch {
    persistent = false;
  }
  state = { ...next, persistent };
  listeners.forEach((l) => l());
}

export const runStore = {
  get: (): RunsState => state,

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  active(): Run | null {
    return state.runs.find((r) => r.id === state.activeId) ?? null;
  },

  /** Adds a run (or replaces one with the same id) and makes it active. */
  put(run: Run) {
    const exists = state.runs.some((r) => r.id === run.id);
    const runs = exists ? state.runs.map((r) => (r.id === run.id ? run : r)) : [...state.runs, run];
    commit({ runs, activeId: run.id });
  },

  /** Applies a change to the active run. */
  update(change: (run: Run) => Run) {
    const run = runStore.active();
    if (!run) return;
    const next = change(run);
    if (next === run) return;
    commit({ runs: state.runs.map((r) => (r.id === run.id ? next : r)), activeId: state.activeId });
  },

  select(id: string) {
    if (state.runs.some((r) => r.id === id)) commit({ runs: state.runs, activeId: id });
  },

  remove(id: string) {
    const runs = state.runs.filter((r) => r.id !== id);
    commit({ runs, activeId: state.activeId === id ? (runs[0]?.id ?? null) : state.activeId });
  },
};
