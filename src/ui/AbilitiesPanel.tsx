import { useMemo, useState } from "react";
import type { Dex } from "../data/load.ts";
import { isRealAbility } from "../data/load.ts";
import { containedIn } from "../data/composite.ts";
import type { AbilityRule } from "../data/flags.ts";
import { directRule, flagFor } from "../data/flags.ts";
import type { Run } from "../run/model.ts";
import { setAbilityRule } from "../run/model.ts";
import { runStore } from "../run/store.ts";
import { matchesQuery, PokeBall, SpeciesLink, useListKeys, useReplay } from "./common.tsx";
import { FlagBadge } from "./Flags.tsx";
import { href } from "./route.ts";
import { useRuns } from "./useRuns.ts";

export function AbilitiesPanel({ dex, selected }: { dex: Dex; selected: string | null }) {
  const { run } = useRuns();
  const [query, setQuery] = useState("");
  const [inDesc, setInDesc] = useState(false);

  const list = useMemo(
    () =>
      dex.abilities
        .map((a, i) => ({ a, i }))
        .filter(({ a, i }) => isRealAbility(dex, i) && matchesQuery(inDesc ? `${a.name} ${a.desc}` : a.name, query))
        .sort((x, y) => x.a.name.localeCompare(y.a.name)),
    [dex, query, inDesc],
  );

  const { listRef, onKeyDown } = useListKeys(
    "abilities",
    list.map(({ a }) => a.key),
    selected,
  );
  const index = selected ? dex.abilityByKey.get(selected) : undefined;

  return (
    <div className={`split${selected ? " has-item" : ""}`}>
      <div className="list-pane" onKeyDown={onKeyDown}>
        <div className="filters">
          <input
            type="search"
            placeholder="Search abilities"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <label className="check">
            <input type="checkbox" checked={inDesc} onChange={(e) => setInDesc(e.target.checked)} />
            Search descriptions
          </label>
        </div>
        <div className="count">{list.length} abilities · ↑↓ to browse</div>
        <ul className="list" ref={listRef}>
          {list.map(({ a }) => (
            <li key={a.key}>
              <a href={href("abilities", a.key)} className={a.key === selected ? "active" : ""} data-ability={a.key}>
                <PokeBall />
                <span className="name">{a.name}</span>
                {run && <RuleMark rule={directRule(run, a.key)} />}
              </a>
            </li>
          ))}
        </ul>
      </div>
      <div className="detail-pane">
        <a className="back-link" href={href("abilities")}>
          ← Abilities
        </a>
        {index === undefined ? (
          <p className="muted">{selected ? `That ability does not exist in this version.` : "Pick an ability."}</p>
        ) : (
          <AbilityDetail dex={dex} index={index} run={run} />
        )}
      </div>
    </div>
  );
}

function RuleMark({ rule }: { rule: AbilityRule }) {
  if (rule === "banned") return <span className="mark banned" title="Banned">⛔</span>;
  if (rule === "limited") return <span className="mark limited" title="Limited">⚠</span>;
  return null;
}

function AbilityDetail({ dex, index, run }: { dex: Dex; index: number; run: Run | null }) {
  const a = dex.abilities[index];
  const users = dex.abilityUsers.get(index) ?? { abis: [], inns: [] };
  const plateRef = useReplay<HTMLDivElement>(a.key, "flash");
  const restRef = useReplay<HTMLDivElement>(a.key, "rise");
  return (
    <article className="detail">
      <div className="ability-top">
        <div className="nameplate" ref={plateRef}>
          <span>{a.name}</span>
        </div>
        <section className="plate">
          <p className="desc">{a.desc}</p>
        </section>
      </div>
      <div className="dex-sections" ref={restRef}>
        {run && <RulePlate dex={dex} run={run} index={index} />}
        <CompositePlate dex={dex} index={index} />
        {run && <RecordedPlate dex={dex} run={run} abilityKey={a.key} />}
        <section className="plate">
          <h2>Base game: species with it as an ability ({users.abis.length})</h2>
          <SpeciesList dex={dex} list={users.abis} />
        </section>
        <section className="plate">
          <h2>Base game: species with it as an innate ({users.inns.length})</h2>
          <SpeciesList dex={dex} list={users.inns} />
        </section>
      </div>
    </article>
  );
}

function SpeciesList({ dex, list }: { dex: Dex; list: number[] }) {
  if (!list.length) return <p className="muted">None in the base game.</p>;
  return (
    <ul className="chips">
      {list.map((i) => (
        <li key={i}>
          <SpeciesLink dex={dex} index={i} />
        </li>
      ))}
    </ul>
  );
}

const RULES: { rule: AbilityRule; label: string }[] = [
  { rule: "allowed", label: "Allowed" },
  { rule: "limited", label: "⚠ Limited" },
  { rule: "banned", label: "⛔ Banned" },
];

function RulePlate({ dex, run, index }: { dex: Dex; run: Run; index: number }) {
  const key = dex.abilities[index].key;
  const direct = directRule(run, key);
  const effective = flagFor(dex, dex.composites, run, index);
  return (
    <section className="plate">
      <h2>Rule in this run</h2>
      <div className="segmented" role="radiogroup" aria-label="Rule">
        {RULES.map((r) => (
          <button
            key={r.rule}
            role="radio"
            aria-checked={direct === r.rule}
            className={`btn small${direct === r.rule ? ` on ${r.rule}` : ""}`}
            onClick={() => runStore.update((run) => setAbilityRule(run, key, r.rule))}
          >
            {r.label}
          </button>
        ))}
      </div>
      {direct === "allowed" && effective.rule !== "allowed" && (
        <p className="hint">
          <FlagBadge dex={dex} flag={effective} /> because it contains{" "}
          {effective.via.map((i, n) => (
            <span key={i}>
              {n > 0 && ", "}
              <a href={href("abilities", dex.abilities[i].key)} data-ability={dex.abilities[i].key}>
                {dex.abilities[i].name}
              </a>
            </span>
          ))}
          .
        </p>
      )}
      <p className="hint">Limited abilities count toward the stack limit (Rules page). Banned ones mean reroll or box.</p>
    </section>
  );
}

function AbilityLinks({ dex, list }: { dex: Dex; list: number[] }) {
  return (
    <ul className="chips">
      {list.map((i) => (
        <li key={i}>
          <a href={href("abilities", dex.abilities[i].key)} data-ability={dex.abilities[i].key}>
            {dex.abilities[i].name}
          </a>
        </li>
      ))}
    </ul>
  );
}

function CompositePlate({ dex, index }: { dex: Dex; index: number }) {
  const own = dex.composites.get(index);
  const parents = containedIn(dex.composites, index);
  if (!own && !parents.length) return null;
  return (
    <section className="plate">
      {own && (
        <>
          <h2>Made of</h2>
          {own.components.length > 0 && <AbilityLinks dex={dex} list={own.components} />}
          {own.unknown.length > 0 && (
            <p className="verdict note">
              ? Unchecked: couldn't find {own.unknown.map((u) => `"${u}"`).join(", ")} in the ability list. Decide by hand
              whether it should be limited or banned.
            </p>
          )}
        </>
      )}
      {parents.length > 0 && (
        <>
          <h2 className={own ? "spaced" : ""}>Part of ({parents.length})</h2>
          <AbilityLinks dex={dex} list={parents} />
        </>
      )}
    </section>
  );
}

function RecordedPlate({ dex, run, abilityKey }: { dex: Dex; run: Run; abilityKey: string }) {
  const species = Object.entries(run.speciesOverrides)
    .filter(([, o]) => o.abilities.includes(abilityKey) || o.innates.includes(abilityKey))
    .map(([key, o]) => ({ key, innate: o.innates.includes(abilityKey) }));
  return (
    <section className="plate">
      <h2>In your run: recorded species with it ({species.length})</h2>
      {species.length ? (
        <ul className="chips">
          {species.map(({ key, innate }) => {
            const i = dex.speciesByKey.get(key);
            return (
              <li key={key}>
                {i !== undefined ? <SpeciesLink dex={dex} index={i} /> : key}
                <span className="muted"> ({innate ? "innate" : "ability"})</span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="muted">None recorded yet.</p>
      )}
    </section>
  );
}
