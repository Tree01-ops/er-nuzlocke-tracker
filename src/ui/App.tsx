import { useEffect, useState } from "react";
import type { Dex } from "../data/load.ts";
import { loadDex, loadVersions } from "../data/load.ts";
import type { VersionInfo } from "../data/types.ts";
import { setRunVersion } from "../run/model.ts";
import { runStore } from "../run/store.ts";
import { AbilitiesPanel } from "./AbilitiesPanel.tsx";
import { AbilityTooltip } from "./AbilityTooltip.tsx";
import { AreasPanel } from "./AreasPanel.tsx";
import { BackupReminder } from "./BackupReminder.tsx";
import { MonList } from "./Mons.tsx";
import type { Panel } from "./route.ts";
import { href, useRoute } from "./route.ts";
import { RulesPanel } from "./RulesPanel.tsx";
import { RunPanel } from "./RunPanel.tsx";
import { SoundControls } from "./SoundControls.tsx";
import { SpeciesPanel } from "./SpeciesPanel.tsx";
import { useRuns } from "./useRuns.ts";

const NAV: { panel: Panel; label: string }[] = [
  { panel: "run", label: "Run" },
  { panel: "areas", label: "Areas" },
  { panel: "species", label: "Species" },
  { panel: "abilities", label: "Abilities" },
  { panel: "rules", label: "Rules" },
];

const VERSION_KEY = "er-nuzlocke.version";

function savedVersion(): string | null {
  try {
    return localStorage.getItem(VERSION_KEY);
  } catch {
    return null;
  }
}

export function App() {
  const route = useRoute();
  const [versions, setVersions] = useState<VersionInfo[]>([]);
  const [chosenVersion, setChosenVersion] = useState<string | null>(null);
  const { runs, run } = useRuns();
  // A loaded run decides the game version; without one, the dropdown does.
  const runVersionKnown = !!run && versions.some((v) => v.id === run.version);
  const version = runVersionKnown ? run!.version : chosenVersion;
  const setVersion = (v: string) => (run ? runStore.update((r) => setRunVersion(r, v)) : setChosenVersion(v));
  const [dex, setDex] = useState<Dex | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Phone layout: the party/box/graveyard rail is a slide-up drawer.
  const [drawer, setDrawer] = useState(false);
  useEffect(() => setDrawer(false), [route.panel, route.item]);

  useEffect(() => {
    loadVersions()
      .then((vs) => {
        setVersions(vs);
        const saved = savedVersion();
        setChosenVersion(vs.some((v) => v.id === saved) ? saved : vs[0].id);
      })
      .catch((e) => setError(String(e.message ?? e)));
  }, []);

  useEffect(() => {
    if (!version) return;
    try {
      localStorage.setItem(VERSION_KEY, version);
    } catch {
      /* storage unavailable; the choice just won't be remembered */
    }
    let current = true;
    setDex(null);
    loadDex(version)
      .then((d) => current && setDex(d))
      .catch((e) => current && setError(String(e.message ?? e)));
    return () => {
      current = false;
    };
  }, [version]);

  return (
    <div className="app">
      <header className="topbar">
        <strong className="brand">ER Nuzlocke</strong>
        <select
          className="version-select"
          value={version ?? ""}
          onChange={(e) => setVersion(e.target.value)}
          aria-label="Game version"
        >
          {versions.map((v) => (
            <option key={v.id} value={v.id}>
              Elite Redux {v.label}
            </option>
          ))}
        </select>
        {runs.length ? (
          <select value={run?.id ?? ""} onChange={(e) => runStore.select(e.target.value)} aria-label="Loaded run">
            {runs.map((r) => (
              <option key={r.id} value={r.id}>
                Run: {r.name}
              </option>
            ))}
          </select>
        ) : (
          <a className="topbar-link" href={href("run")}>
            Start a run
          </a>
        )}
        {run && !runVersionKnown && (
          <span className="muted" title="Showing the selected data version instead">
            (run was made for {run.version || "an unknown version"})
          </span>
        )}
        <span className="spacer" />
        <SoundControls />
        {run && (
          <a className="topbar-link bans-link" href={href("rules")} title="Banned and limited abilities in this run">
            ⛔ {run.bans.length} banned · ⚠ {run.limited.length} limited
          </a>
        )}
      </header>

      <nav className="sidebar paper">
        {NAV.map((n) => (
          <a key={n.panel} href={href(n.panel)} className={route.panel === n.panel ? "active" : ""}>
            {n.label}
          </a>
        ))}
        <button className={`party-tab${drawer ? " active" : ""}`} aria-expanded={drawer} onClick={() => setDrawer(!drawer)}>
          Party{run ? ` ${run.party.length}/6` : ""}
        </button>
      </nav>

      <main className="main paper">
        <BackupReminder />
        <div className="panel" key={route.panel}>
          {error ? (
            <p className="error">{error}</p>
          ) : !dex ? (
            <p className="muted">Loading game data…</p>
          ) : route.panel === "species" ? (
            <SpeciesPanel dex={dex} selected={route.item} />
          ) : route.panel === "abilities" ? (
            <AbilitiesPanel dex={dex} selected={route.item} />
          ) : route.panel === "areas" ? (
            <AreasPanel dex={dex} selected={route.item} />
          ) : route.panel === "run" ? (
            <RunPanel dex={dex} versions={versions} version={version} setVersion={setVersion} />
          ) : (
            <RulesPanel dex={dex} />
          )}
        </div>
      </main>

      {dex && <AbilityTooltip dex={dex} />}
      {drawer && <div className="drawer-backdrop" onClick={() => setDrawer(false)} />}
      <aside className={`rail paper${drawer ? " open" : ""}`}>
        <div className="drawer-head">
          <span>Party · Box · Graveyard</span>
          <button className="btn small" onClick={() => setDrawer(false)}>
            Close
          </button>
        </div>
        {!run || !dex ? (
          <section className="plate">
            <h3>Party</h3>
            <p className="muted">{run ? "Loading…" : "No run loaded"}</p>
          </section>
        ) : (
          <>
            <section className="plate">
              <h3>Party ({run.party.length}/6)</h3>
              <MonList dex={dex} run={run} place="party" />
            </section>
            <section className="plate">
              <h3>Box ({run.box.length})</h3>
              <MonList dex={dex} run={run} place="box" />
            </section>
            <section className="plate">
              <h3>Graveyard ({run.graveyard.length})</h3>
              <MonList dex={dex} run={run} place="graveyard" />
            </section>
          </>
        )}
        {dex && <p className="source muted">Data: ER-nextdex, generated {dex.sourceDate.slice(0, 10)}</p>}
      </aside>
    </div>
  );
}
