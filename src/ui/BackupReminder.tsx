import { useState } from "react";
import { needsBackup } from "../run/model.ts";
import { href } from "./route.ts";
import { useRuns } from "./useRuns.ts";

const SNOOZE_KEY = "er-nuzlocke.backup-snooze";
const DAY = 24 * 60 * 60 * 1000;

function snoozedUntil(runId: string): number {
  try {
    return (JSON.parse(localStorage.getItem(SNOOZE_KEY) ?? "{}") as Record<string, number>)[runId] ?? 0;
  } catch {
    return 0;
  }
}

/** Banner asking for an export when the run has unsaved-elsewhere progress. "Later" hides it for a day. */
export function BackupReminder() {
  const { run } = useRuns();
  const [, rerender] = useState(0);
  if (!run || !needsBackup(run) || snoozedUntil(run.id) > Date.now()) return null;

  const later = () => {
    try {
      const all = JSON.parse(localStorage.getItem(SNOOZE_KEY) ?? "{}") as Record<string, number>;
      localStorage.setItem(SNOOZE_KEY, JSON.stringify({ ...all, [run.id]: Date.now() + DAY }));
    } catch {
      /* can't remember the snooze; it just shows again next time */
    }
    rerender((n) => n + 1);
  };

  return (
    <div className="backup-reminder" role="status">
      <span>
        💾 Back up "{run.name}": {run.exportedAt ? `last export ${Math.floor((Date.now() - run.exportedAt) / DAY)} days ago` : "never exported"}.
        Browser storage can be cleared, especially on phones.
      </span>
      <span className="actions-inline">
        <a className="btn small primary" href={href("run")}>
          Export
        </a>
        <button className="btn small" onClick={later}>
          Later
        </button>
      </span>
    </div>
  );
}
