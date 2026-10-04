import { useState } from "react";
import type { Dex } from "../data/load.ts";
import type { VersionInfo } from "../data/types.ts";
import { exportFileName, fromCode, fromExportJson, toCode, toExportJson } from "../run/codec.ts";
import type { Run } from "../run/model.ts";
import { createRun, markExported, newId, PARTY_SIZE, renameRun } from "../run/model.ts";
import { runStore } from "../run/store.ts";
import { MonList } from "./Mons.tsx";
import { useRuns } from "./useRuns.ts";

export function NewRunForm({ version }: { version: string }) {
  const [name, setName] = useState("");
  return (
    <form
      className="inline-form"
      onSubmit={(e) => {
        e.preventDefault();
        runStore.put(createRun(name.trim() || `Run ${runStore.get().runs.length + 1}`, version));
        setName("");
      }}
    >
      <input value={name} placeholder="Run name" onChange={(e) => setName(e.target.value)} />
      <button className="btn primary" type="submit">
        New run
      </button>
    </form>
  );
}

export function RunPanel({
  dex,
  versions,
  version,
  setVersion,
}: {
  dex: Dex;
  versions: VersionInfo[];
  version: string | null;
  setVersion: (v: string) => void;
}) {
  const { runs, run, persistent } = useRuns();

  return (
    <div className="detail-pane full">
      <article className="detail run-page">
        {!persistent && (
          <p className="warn">
            ⚠ This browser isn't letting the app save. Your run will be lost when the tab closes; export it to keep it.
          </p>
        )}
        <div className="run-grid">
          <div className="run-col">
            <section className="plate">
              <h2>Runs</h2>
              {runs.length === 0 && <p className="muted">No runs yet.</p>}
              <ul className="runs">
                {runs.map((r) => (
                  <RunRow key={r.id} run={r} active={r.id === run?.id} />
                ))}
              </ul>
              <NewRunForm version={dex.version} />
            </section>
            {run && <Summary dex={dex} run={run} />}
            {run && <ExportPlate run={run} />}
            <ImportPlate />
            <section className="plate">
              <h2>Game version</h2>
              <select value={version ?? ""} onChange={(e) => setVersion(e.target.value)} aria-label="Game version">
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    Elite Redux {v.label}
                  </option>
                ))}
              </select>
              <p className="hint">{run ? "Saved with this run." : "Used until you start a run."}</p>
            </section>
            <OfflinePlate dex={dex} />
          </div>
          {run && (
            <div className="run-col">
              <section className="plate">
                <h2>
                  Party ({run.party.length}/{PARTY_SIZE})
                </h2>
                <MonList dex={dex} run={run} place="party" full />
              </section>
              <section className="plate">
                <h2>Box ({run.box.length})</h2>
                <MonList dex={dex} run={run} place="box" full />
              </section>
              <section className="plate">
                <h2>Graveyard ({run.graveyard.length})</h2>
                <MonList dex={dex} run={run} place="graveyard" full />
              </section>
            </div>
          )}
        </div>
      </article>
    </div>
  );
}

function RunRow({ run, active }: { run: Run; active: boolean }) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(run.name);
  const caught = Object.keys(run.mons).length;

  if (renaming) {
    return (
      <li className="run-row active">
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            runStore.put(renameRun(run, name));
            setRenaming(false);
          }}
        >
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn small primary" type="submit">
            Save
          </button>
          <button className="btn small" type="button" onClick={() => setRenaming(false)}>
            Cancel
          </button>
        </form>
      </li>
    );
  }

  return (
    <li className={`run-row${active ? " active" : ""}`}>
      <div>
        <div>{run.name}</div>
        <div className="muted small-text">
          ER {run.version} · {caught} caught · {run.graveyard.length} dead · updated{" "}
          {new Date(run.updatedAt).toLocaleDateString()}
        </div>
      </div>
      <div className="mon-actions">
        {!active && (
          <button className="btn small primary" onClick={() => runStore.select(run.id)}>
            Load
          </button>
        )}
        <button
          className="btn small"
          onClick={() => {
            setName(run.name);
            setRenaming(true);
          }}
        >
          Rename
        </button>
        <button
          className="btn small danger"
          onClick={() => {
            if (confirm(`Delete "${run.name}"? This can't be undone. Export it first if you might want it back.`)) {
              runStore.remove(run.id);
            }
          }}
        >
          Delete
        </button>
      </div>
    </li>
  );
}

function Summary({ dex, run }: { dex: Dex; run: Run }) {
  const statuses = Object.values(run.areas).map((a) => a.status);
  const done = dex.areas.filter((a) => run.areas[a.key]?.status).length;
  return (
    <section className="plate info-plate">
      <h2>{run.name}</h2>
      <div>
        <span className="label">Areas done</span>
        <span>
          {done}/{dex.areas.length}
        </span>
      </div>
      <div>
        <span className="label">Caught</span>
        <span>{statuses.filter((s) => s === "caught").length}</span>
      </div>
      <div>
        <span className="label">Alive / dead</span>
        <span>
          {run.party.length + run.box.length} / {run.graveyard.length}
        </span>
      </div>
    </section>
  );
}

function ExportPlate({ run }: { run: Run }) {
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const download = () => {
    const blob = new Blob([toExportJson(run)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = exportFileName(run);
    a.click();
    URL.revokeObjectURL(url);
    runStore.put(markExported(run));
  };

  return (
    <section className="plate">
      <h2>Export</h2>
      <p className="hint">
        Back up this run, or move it to another device. Last backup:{" "}
        {run.exportedAt ? new Date(run.exportedAt).toLocaleString() : "never"}.
      </p>
      <div className="actions">
        <button className="btn primary" onClick={download}>
          Download file
        </button>
        <button
          className="btn"
          onClick={async () => {
            const c = await toCode(run);
            setCode(c);
            runStore.put(markExported(run));
            try {
              await navigator.clipboard.writeText(c);
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}
        >
          Get code
        </button>
      </div>
      {code && (
        <>
          <textarea className="code" readOnly value={code} onFocus={(e) => e.target.select()} />
          <p className="hint">
            {copied ? "Copied to clipboard. " : ""}
            {code.length.toLocaleString()} characters. Paste it into Import on the other device.
          </p>
        </>
      )}
    </section>
  );
}

function ImportPlate() {
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const add = (imported: Run) => {
    const existing = runStore.get().runs.find((r) => r.id === imported.id);
    let run = imported;
    if (existing && !confirm(`You already have "${existing.name}". OK replaces it with the import; Cancel keeps both.`)) {
      run = { ...imported, id: newId(), name: `${imported.name} (import)` };
    }
    runStore.put(run);
    setMessage({ ok: true, text: `Imported "${run.name}" and loaded it.` });
  };
  const fail = (e: unknown) => setMessage({ ok: false, text: e instanceof Error ? e.message : String(e) });

  return (
    <section className="plate">
      <h2>Import</h2>
      <div className="actions">
        <label className="btn">
          Choose file…
          <input
            type="file"
            accept=".json,application/json"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              try {
                add(fromExportJson(await file.text()));
              } catch (err) {
                fail(err);
              }
            }}
          />
        </label>
      </div>
      <textarea className="code" value={code} placeholder="…or paste a run code (ERN1.…)" onChange={(e) => setCode(e.target.value)} />
      <div className="actions">
        <button
          className="btn"
          disabled={!code.trim()}
          onClick={async () => {
            try {
              add(await fromCode(code));
              setCode("");
            } catch (err) {
              fail(err);
            }
          }}
        >
          Import code
        </button>
      </div>
      {message && <p className={message.ok ? "ok" : "warn"}>{message.text}</p>}
    </section>
  );
}

/**
 * Fetches every sprite and cry once so the service worker caches them for offline use.
 * Only works in the built app (the service worker isn't active in development).
 */
function OfflinePlate({ dex }: { dex: Dex }) {
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const active = typeof navigator !== "undefined" && !!navigator.serviceWorker?.controller;

  const run = async () => {
    const base = import.meta.env.BASE_URL;
    const files = Object.entries(dex.sprites).flatMap(([key, e]) => {
      const name = key.replace(/^SPECIES_/, "");
      return [`${base}sprites/${name}.png`, ...(e.icon ? [`${base}sprites/${name}.icon.png`] : [])];
    });
    try {
      const cries: Record<string, string> = await (await fetch(`${base}sounds/cries/index.json`)).json();
      files.push(...[...new Set(Object.values(cries))].map((c) => `${base}sounds/cries/${c}.wav`));
    } catch {
      /* cries index unavailable; sprites still get saved */
    }
    let done = 0;
    setProgress({ done, total: files.length });
    let next = 0;
    await Promise.all(
      Array.from({ length: 8 }, async () => {
        while (next < files.length) {
          await fetch(files[next++]).catch(() => null);
          done++;
          if (done % 50 === 0 || done === files.length) setProgress({ done, total: files.length });
        }
      }),
    );
  };

  return (
    <section className="plate">
      <h2>Offline</h2>
      <p className="hint">
        The app and game data work offline once loaded. Sprites and cries are saved as you view them, or all at once here
        (about 15 MB).
      </p>
      {active ? (
        <button className="btn" disabled={!!progress && progress.done < progress.total} onClick={run}>
          {progress
            ? progress.done < progress.total
              ? `Saving… ${progress.done}/${progress.total}`
              : "All saved for offline ✓"
            : "Save all sprites and cries"}
        </button>
      ) : (
        <p className="muted">Available in the built or installed app.</p>
      )}
    </section>
  );
}
