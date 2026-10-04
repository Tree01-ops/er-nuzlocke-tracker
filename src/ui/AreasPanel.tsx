import { useMemo, useState } from "react";
import { bstTier } from "../../config/bstTiers.ts";
import { familyDuplicates } from "../data/family.ts";
import type { Dex } from "../data/load.ts";
import type { Area, EncounterMethod } from "../data/types.ts";
import type { AreaRecord, Run } from "../run/model.ts";
import { catchMon, placeOf, reopenArea, rerollEncounter, setAreaNotes } from "../run/model.ts";
import { runStore } from "../run/store.ts";
import type { Option } from "./Autocomplete.tsx";
import { Autocomplete } from "./Autocomplete.tsx";
import { AbilityLink, matchesQuery, PokeBall, SpeciesLink, Sprite, Types, useListKeys, useReplay } from "./common.tsx";
import { AbilityEditor, evaluateFor, Verdict } from "./Flags.tsx";
import { MonRow, speciesName } from "./Mons.tsx";
import { NewRunForm } from "./RunPanel.tsx";
import { href } from "./route.ts";
import { useRuns } from "./useRuns.ts";

const METHOD_LABELS: Record<EncounterMethod, string> = {
  land: "Walking",
  surf: "Surfing",
  oldRod: "Old Rod",
  goodRod: "Good Rod",
  superRod: "Super Rod",
  rockSmash: "Rock Smash",
  honey: "Honey",
  hidden: "Hidden",
};

export function AreasPanel({ dex, selected }: { dex: Dex; selected: string | null }) {
  const { run } = useRuns();
  const [query, setQuery] = useState("");
  const [hideDone, setHideDone] = useState(false);

  const list = useMemo(
    () =>
      dex.areas
        .map((a, i) => ({ a, no: i + 1 }))
        .filter(({ a }) => matchesQuery(a.name, query) && !(hideDone && run?.areas[a.key]?.status)),
    [dex, query, hideDone, run],
  );
  const { listRef, onKeyDown } = useListKeys(
    "areas",
    list.map(({ a }) => a.key),
    selected,
  );
  const done = run ? dex.areas.filter((a) => run.areas[a.key]?.status).length : 0;
  const area = dex.areas.find((a) => a.key === selected);

  return (
    <div className={`split${selected ? " has-item" : ""}`}>
      <div className="list-pane" onKeyDown={onKeyDown}>
        <div className="filters">
          <input type="search" placeholder="Search areas" value={query} onChange={(e) => setQuery(e.target.value)} />
          <label className="check">
            <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} />
            Hide finished areas
          </label>
        </div>
        <div className="count">
          {done}/{dex.areas.length} areas done · ↑↓ to browse
        </div>
        <ul className="list" ref={listRef}>
          {list.map(({ a, no }, i) => {
            const rec = run?.areas[a.key];
            const header = i === 0 || list[i - 1].a.group !== a.group;
            return (
              <li key={a.key}>
                {header && <div className="list-group">{a.group}</div>}
                <a href={href("areas", a.key)} className={a.key === selected ? "active" : ""}>
                  <PokeBall state={areaBall(run, rec)} />
                  <span className="dexno">{String(no).padStart(2, "0")}</span>
                  <span className="name">{a.name}</span>
                  {rec?.species && <span className="row-note">{speciesName(dex, rec.species)}</span>}
                </a>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="detail-pane">
        <a className="back-link" href={href("areas")}>
          ← Areas
        </a>
        {!run ? (
          <section className="plate start-plate">
            <h2>Start a run</h2>
            <p>Runs are saved in this browser. Name it after your save file or challenge.</p>
            <NewRunForm version={dex.version} />
          </section>
        ) : area ? (
          <AreaDetail dex={dex} run={run} area={area} />
        ) : (
          <p className="muted">Pick an area.</p>
        )}
      </div>
    </div>
  );
}

function areaBall(run: Run | null, rec: AreaRecord | undefined): "open" | "dead" | undefined {
  if (!run || !rec?.status) return "open";
  return rec.monId && placeOf(run, rec.monId) === "graveyard" ? "dead" : undefined;
}

function AreaDetail({ dex, run, area }: { dex: Dex; run: Run; area: Area }) {
  const rec = run.areas[area.key] ?? {};
  const topRef = useReplay<HTMLDivElement>(area.key, "scan");
  const plateRef = useReplay<HTMLDivElement>(area.key, "flash");
  const restRef = useReplay<HTMLDivElement>(area.key, "rise");

  return (
    <article className="detail">
      <div className="ability-top" ref={topRef}>
        <div className="nameplate" ref={plateRef}>
          <span>{area.name}</span>
        </div>
        <div className="methods">
          {area.methods.map((m) => (
            <span key={m.method} className="method">
              {METHOD_LABELS[m.method]}
            </span>
          ))}
          {area.statics.length > 0 && <span className="method">Gifts / static</span>}
          <span className="muted group-name">{area.group}</span>
        </div>
        {rec.status ? (
          <ResultPlate dex={dex} run={run} area={area} />
        ) : (
          <EncounterForm key={area.key} dex={dex} run={run} area={area} />
        )}
      </div>

      <div className="dex-sections" ref={restRef}>
        {rec.rerolls && rec.rerolls.length > 0 && (
          <section className="plate">
            <h2>Rerolled here</h2>
            <ul className="chips">
              {rec.rerolls.map((r, i) => (
                <li key={i}>
                  <a href={href("species", r.species)}>{speciesName(dex, r.species)}</a>
                </li>
              ))}
            </ul>
          </section>
        )}
        <section className="plate">
          <h2>Notes</h2>
          <textarea
            key={area.key}
            className="notes"
            defaultValue={rec.notes ?? ""}
            placeholder="Anything worth remembering about this area"
            onBlur={(e) => {
              if (e.target.value !== (rec.notes ?? "")) runStore.update((r) => setAreaNotes(r, area.key, e.target.value));
            }}
          />
        </section>
        <BaseEncounters dex={dex} area={area} />
      </div>
    </article>
  );
}

function EncounterForm({ dex, run, area }: { dex: Dex; run: Run; area: Area }) {
  const [text, setText] = useState("");
  const [species, setSpecies] = useState<string | null>(null);
  const [nickname, setNickname] = useState("");

  const options: Option[] = useMemo(
    () =>
      dex.species.slice(1).map((s) => ({
        key: s.key,
        label: s.name,
        hint: s.types.map((t) => dex.types[t]).filter((t, i, a) => a.indexOf(t) === i).join("/"),
      })),
    [dex],
  );

  const pick = (key: string) => {
    setSpecies(key);
    setText(speciesName(dex, key));
  };
  const reset = () => {
    setSpecies(null);
    setText("");
    setNickname("");
  };

  return (
    <section className="plate encounter">
      <h2>Encounter</h2>
      <div className="encounter-row">
        <Autocomplete
          options={options}
          value={text}
          onChange={(t) => {
            setText(t);
            setSpecies(null);
          }}
          onPick={(o) => pick(o.key)}
          placeholder="Which Pokémon did you meet?"
          autoFocus
        />
        <input
          className="nick"
          value={nickname}
          placeholder="Nickname"
          onChange={(e) => setNickname(e.target.value)}
        />
      </div>

      {area.statics.length > 0 && (
        <div className="statics">
          <span className="muted">Gifts / static here:</span>
          {area.statics.map((s) => (
            <button key={s.spc} className="btn small" title={`${s.how.join(", ")} · ${s.map}`} onClick={() => pick(dex.species[s.spc].key)}>
              {dex.species[s.spc].name}
            </button>
          ))}
        </div>
      )}

      {species && <EncounterPreview dex={dex} run={run} speciesKey={species} />}

      <div className="actions">
        <button
          className="btn primary"
          disabled={!species}
          onClick={() => {
            runStore.update((r) => catchMon(r, area.key, species!, nickname));
            reset();
          }}
        >
          Catch
        </button>
        <button
          className="btn blue"
          disabled={!species}
          title="Throw this one back (banned ability, duplicate...) and keep the area open"
          onClick={() => {
            runStore.update((r) => rerollEncounter(r, area.key, species!));
            reset();
          }}
        >
          Reroll
        </button>
      </div>
    </section>
  );
}

function EncounterPreview({ dex, run, speciesKey }: { dex: Dex; run: Run; speciesKey: string }) {
  const index = dex.speciesByKey.get(speciesKey);
  if (index === undefined) return null;
  const s = dex.species[index];
  const total = s.base.reduce((a, b) => a + b, 0);
  const owned = Object.values(run.mons);
  const dupes = run.rules.duplicatesClause ? familyDuplicates(dex, speciesKey, owned) : [];
  const ev = evaluateFor(dex, run, speciesKey);

  return (
    <div className="preview">
      <div className="preview-top">
        <Sprite dex={dex} speciesKey={speciesKey} scale={2} className="reveal" key={speciesKey} />
        <div>
          <div className="preview-head">
            <SpeciesLink dex={dex} index={index} />
            <Types dex={dex} types={s.types} />
          </div>
          <div className="preview-bst">
            <span className="label">Base Stat Total</span> {total}{" "}
            <span className={`tier tier-${bstTier(total)}`}>{bstTier(total)}</span>
          </div>
        </div>
      </div>
      {dupes.length > 0 && (
        <p className="warn">
          ⚠ Duplicate: you already caught{" "}
          {dupes.map((id, i) => (
            <span key={id}>
              {i > 0 && ", "}
              {run.mons[id].nickname ?? speciesName(dex, run.mons[id].species)}
            </span>
          ))}{" "}
          from this family. Duplicates clause says reroll.
        </p>
      )}
      <Verdict dex={dex} run={run} ev={ev} />
      <h3 className="editor-title">Randomized abilities</h3>
      <AbilityEditor key={speciesKey} dex={dex} run={run} speciesKey={speciesKey} />
      <details className="defaults">
        <summary className="muted">Game defaults</summary>
        <div className="abilities-grid dimmed">
          <div className="label">Abilities</div>
          {s.abis.map((a, i) => (
            <div key={i}>
              <AbilityLink dex={dex} index={a} />
            </div>
          ))}
          <div className="label">Innates</div>
          {s.inns.map((a, i) => (
            <div key={i}>
              <AbilityLink dex={dex} index={a} />
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

function ResultPlate({ dex, run, area }: { dex: Dex; run: Run; area: Area }) {
  const rec = run.areas[area.key];
  const place = rec.monId ? placeOf(run, rec.monId) : null;

  return (
    <section className="plate">
      <h2>Caught</h2>
      {rec.monId && place ? (
        <>
          <ul className="mons">
            <MonRow dex={dex} run={run} monId={rec.monId} place={place} />
          </ul>
          <p className="muted">In your {place}.</p>
        </>
      ) : (
        <p>{rec.species ? speciesName(dex, rec.species) : "Nothing recorded."}</p>
      )}
      <div className="actions">
        <button
          className="btn"
          onClick={() => {
            if (rec.monId && !confirm("Remove this catch? The Pokémon is taken out of the run and the route opens again.")) return;
            runStore.update((r) => reopenArea(r, area.key));
          }}
        >
          Remove catch
        </button>
      </div>
    </section>
  );
}

function BaseEncounters({ dex, area }: { dex: Dex; area: Area }) {
  if (!area.methods.length && !area.statics.length) return null;
  return (
    <details className="plate">
      <summary>
        <h2>Unrandomized encounter tables</h2>
      </summary>
      <p className="hint">What the base game has here. Useful if a method isn't randomized in your run.</p>
      {area.methods.map((m) => (
        <div key={m.method} className="enc-table">
          <h3>{METHOD_LABELS[m.method]}</h3>
          <table>
            <tbody>
              {m.slots.map((s) => (
                <tr key={s.spc}>
                  <td>
                    <SpeciesLink dex={dex} index={s.spc} />
                  </td>
                  <td className="num">{s.rate}%</td>
                  <td className="muted">Lv {s.min === s.max ? s.min : `${s.min}–${s.max}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {area.statics.length > 0 && (
        <div className="enc-table">
          <h3>Gifts / static</h3>
          <table>
            <tbody>
              {area.statics.map((s) => (
                <tr key={s.spc}>
                  <td>
                    <SpeciesLink dex={dex} index={s.spc} />
                  </td>
                  <td className="muted">{s.how.join(", ")}</td>
                  <td className="muted">{s.map}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </details>
  );
}
