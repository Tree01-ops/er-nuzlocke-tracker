import { useMemo, useState } from "react";
import type { BanPreset } from "../../config/banPresets.ts";
import { BAN_PRESETS } from "../../config/banPresets.ts";
import { normalizeName } from "../data/keys.ts";
import type { Dex } from "../data/load.ts";
import { isRealAbility } from "../data/load.ts";
import type { Run } from "../run/model.ts";
import { applyPreset, setAbilityRule, setRules } from "../run/model.ts";
import { runStore } from "../run/store.ts";
import type { Option } from "./Autocomplete.tsx";
import { Autocomplete } from "./Autocomplete.tsx";
import { NewRunForm } from "./RunPanel.tsx";
import { href } from "./route.ts";
import { useRuns } from "./useRuns.ts";

/** Preset names resolved against this data version. */
function resolvePreset(dex: Dex, preset: BanPreset) {
  const byName = new Map<string, string>();
  dex.abilities.forEach((a, i) => {
    const n = normalizeName(a.name);
    if (isRealAbility(dex, i) && !byName.has(n)) byName.set(n, a.key);
  });
  const found: string[] = [];
  const missing: string[] = [];
  for (const name of preset.names) {
    const key = byName.get(normalizeName(name));
    if (key) found.push(key);
    else missing.push(name);
  }
  return { found, missing };
}

export function RulesPanel({ dex }: { dex: Dex }) {
  const { run } = useRuns();
  if (!run) {
    return (
      <div className="detail-pane full">
        <section className="plate start-plate">
          <h2>Start a run</h2>
          <p>Rules and bans are saved per run.</p>
          <NewRunForm version={dex.version} />
        </section>
      </div>
    );
  }
  return (
    <div className="detail-pane full">
      <article className="detail run-page">
        <div className="run-grid">
          <div className="run-col">
            <SettingsPlate run={run} />
            {BAN_PRESETS.map((p) => (
              <PresetPlate key={p.id} dex={dex} run={run} preset={p} />
            ))}
          </div>
          <div className="run-col">
            <ListPlate dex={dex} run={run} rule="banned" />
            <ListPlate dex={dex} run={run} rule="limited" />
            <UncheckedPlate dex={dex} run={run} />
          </div>
        </div>
      </article>
    </div>
  );
}

function SettingsPlate({ run }: { run: Run }) {
  const r = run.rules;
  const update = (patch: Partial<Run["rules"]>) => runStore.update((run) => setRules(run, patch));
  return (
    <section className="plate settings">
      <h2>Rules</h2>
      <label className="setting">
        <span>
          Stack limit
          <span className="hint block">Most limited abilities one Pokémon may have, counting innates.</span>
        </span>
        <input
          type="number"
          min={0}
          max={6}
          value={r.stackLimit}
          onChange={(e) => update({ stackLimit: Math.max(0, Math.min(6, Number(e.target.value) || 0)) })}
        />
      </label>
      <label className="setting">
        <span>
          Duplicates clause
          <span className="hint block">Warn when an encounter's evolution family is already caught.</span>
        </span>
        <input type="checkbox" checked={r.duplicatesClause} onChange={(e) => update({ duplicatesClause: e.target.checked })} />
      </label>
      <label className="setting">
        <span>
          Reroll on banned ability
          <span className="hint block">Otherwise the advice is to catch it and box it.</span>
        </span>
        <input type="checkbox" checked={r.rerollOnBan} onChange={(e) => update({ rerollOnBan: e.target.checked })} />
      </label>
    </section>
  );
}

function PresetPlate({ dex, run, preset }: { dex: Dex; run: Run; preset: BanPreset }) {
  const { found, missing } = useMemo(() => resolvePreset(dex, preset), [dex, preset]);
  const list = preset.rule === "banned" ? run.bans : run.limited;
  const applied = found.filter((k) => list.includes(k)).length;
  return (
    <section className="plate">
      <h2>
        Preset: {preset.label} ({applied}/{found.length} applied)
      </h2>
      <p className="hint">
        Sets these to {preset.rule === "banned" ? "⛔ banned" : "⚠ limited"}. Edit the list in config/banPresets.ts.
      </p>
      <ul className="chips">
        {found.map((k) => (
          <li key={k} className={list.includes(k) ? "on" : ""}>
            <a href={href("abilities", k)} data-ability={k}>
              {dex.abilities[dex.abilityByKey.get(k)!].name}
            </a>
          </li>
        ))}
        {missing.map((n) => (
          <li key={n} className="missing" title="Not in this data version">
            {n} <span className="muted">(not in this version)</span>
          </li>
        ))}
      </ul>
      <div className="actions">
        <button
          className="btn primary"
          disabled={applied === found.length}
          onClick={() => runStore.update((r) => applyPreset(r, found, preset.rule, true))}
        >
          Apply
        </button>
        <button className="btn" disabled={!applied} onClick={() => runStore.update((r) => applyPreset(r, found, preset.rule, false))}>
          Remove
        </button>
      </div>
    </section>
  );
}

function ListPlate({ dex, run, rule }: { dex: Dex; run: Run; rule: "banned" | "limited" }) {
  const keys = rule === "banned" ? run.bans : run.limited;
  const [text, setText] = useState("");
  const options: Option[] = useMemo(
    () => dex.abilities.flatMap((a, i) => (isRealAbility(dex, i) && !keys.includes(a.key) ? [{ key: a.key, label: a.name }] : [])),
    [dex, keys],
  );
  const name = (k: string) => {
    const i = dex.abilityByKey.get(k);
    return i !== undefined ? dex.abilities[i].name : `${k} (not in this version)`;
  };
  return (
    <section className="plate">
      <h2>
        {rule === "banned" ? "⛔ Banned" : "⚠ Limited"} ({keys.length})
      </h2>
      {keys.length ? (
        <ul className="chips">
          {[...keys]
            .sort((a, b) => name(a).localeCompare(name(b)))
            .map((k) => (
              <li key={k}>
                <a href={href("abilities", k)} data-ability={k}>
                  {name(k)}
                </a>
                <button
                  className="chip-x"
                  title="Set back to allowed"
                  aria-label={`Remove ${name(k)}`}
                  onClick={() => runStore.update((r) => setAbilityRule(r, k, "allowed"))}
                >
                  ×
                </button>
              </li>
            ))}
        </ul>
      ) : (
        <p className="muted">None.</p>
      )}
      <div className="inline-form">
        <Autocomplete
          options={options}
          value={text}
          onChange={setText}
          onPick={(o) => {
            runStore.update((r) => setAbilityRule(r, o.key, rule));
            setText("");
          }}
          placeholder={`Add a ${rule} ability`}
        />
      </div>
    </section>
  );
}

function UncheckedPlate({ dex, run }: { dex: Dex; run: Run }) {
  const unchecked = [...dex.composites.entries()].filter(([, c]) => c.unknown.length);
  return (
    <section className="plate">
      <h2>Unchecked composites ({unchecked.length})</h2>
      <p className="hint">
        These descriptions name something that isn't in the ability list, so bans can't see inside them. Review each and
        limit or ban it yourself if needed.
      </p>
      <ul className="review">
        {unchecked.map(([i, c]) => {
          const a = dex.abilities[i];
          const rule = run.bans.includes(a.key) ? "⛔" : run.limited.includes(a.key) ? "⚠" : "";
          return (
            <li key={i}>
              <a href={href("abilities", a.key)} data-ability={a.key}>
                {a.name}
              </a>{" "}
              {rule}
              <span className="muted"> {a.desc}</span>
              <span className="unknown"> Unknown: {c.unknown.join(", ")}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
