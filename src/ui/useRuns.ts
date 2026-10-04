import { useSyncExternalStore } from "react";
import type { Run } from "../run/model.ts";
import type { RunsState } from "../run/store.ts";
import { runStore } from "../run/store.ts";

export function useRuns(): RunsState & { run: Run | null } {
  const state = useSyncExternalStore(runStore.subscribe, runStore.get);
  return { ...state, run: state.runs.find((r) => r.id === state.activeId) ?? null };
}
