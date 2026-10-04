import { memo, useDeferredValue, useEffect, useMemo, useState } from "react";
import { playCry } from "../audio/cries.ts";
import { bstTier } from "../../config/bstTiers.ts";
import type { Dex } from "../data/load.ts";
import type { Species } from "../data/types.ts";
import type { Run } from "../run/model.ts";
import {
  AbilityLink,
  matchesQuery,
  PokeBall,
  SpeciesLink,
  Sprite,
  TypeBadge,
  Types,
  useListKeys,
  useReplay,
} from "./common.tsx";
import type { Option } from "./Autocomplete.tsx";
import { Autocomplete } from "./Autocomplete.tsx";
import { AbilityEditor, evaluateFor, Verdict, VerdictMark } from "./Flags.tsx";
import { NewRunForm } from "./RunPanel.tsx";
import { href } from "./route.ts";
import { useRuns } from "./useRuns.ts";
import { StatRadar } from "./StatRadar.tsx";
import { useTween } from "./useTween.ts";

const STAT_NAMES = ["HP", "Atk", "Def", "SpA", "SpD", "Spe"];

export function dexNo(n: number): string {
  return n > 0 ? String(n).padStart(3, "0") : "---";
}

/** Route item for bulk ability entry: #/species/~bulk */
const BULK = "~bulk";

export function SpeciesPanel({ dex, selected }: { dex: Dex; selected: string | null }) {
  const { run } = useRuns();
  const [query, setQuery] = useState("");
  const [type, setType] = useState(-1);
  const [recordedOnly, setRecordedOnly] = useState(false);
  const overrides = run?.speciesOverrides;

  const list = useMemo(
    () =>
      dex.species
        .map((s, i) => ({ s, i }))
        .filter(
          ({ s, i }) =>
            i > 0 &&
            matchesQuery(s.name, query) &&
            (type < 0 || s.types.includes(type)) &&
            (!recordedOnly || !!overrides?.[s.key]),
        ),
    [dex, query, type, recordedOnly, overrides],
  );
  const { listRef, onKeyDown } = useListKeys(
    "species",
    list.map(({ s }) => s.key),
    selected,
  );

  const index = selected ? dex.speciesByKey.get(selected) : undefined;

  return (
    <div className={`split${selected ? " has-item" : ""}`}>
      <div className="list-pane" onKeyDown={onKeyDown}>
        <div className="filters">
          <input
            type="search"
            placeholder="Search species"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <select value={type} onChange={(e) => setType(Number(e.target.value))}>
            <option value={-1}>All types</option>
            {dex.types.map((t, i) => (
              <option key={t} value={i}>
                {t}
              </option>
            ))}
          </select>
          {run && (
            <div className="filter-row">
              <label className="check">
                <input type="checkbox" checked={recordedOnly} onChange={(e) => setRecordedOnly(e.target.checked)} />
                Recorded only ({Object.keys(run.speciesOverrides).length})
              </label>
              <a className={`btn small${selected === BULK ? " primary" : ""}`} href={href("species", BULK)}>
                Bulk entry
              </a>
            </div>
          )}
        </div>
        <div className="count">{list.length} species · ↑↓ to browse</div>
        <ul className="list" ref={listRef}>
          {list.map(({ s }) => (
            <SpeciesRow key={s.key} dex={dex} s={s} run={run} active={s.key === selected} />
          ))}
        </ul>
      </div>
      <div className="detail-pane">
        <a className="back-link" href={href("species")}>
          ← Species
        </a>
        {selected === BULK ? (
          run ? (
            <BulkEntry dex={dex} />
          ) : (
            <p className="muted">Start a run first.</p>
          )
        ) : index === undefined ? (
          <p className="muted">{selected ? `${selected} does not exist in this version.` : "Pick a species."}</p>
        ) : (
          <SpeciesDetail dex={dex} index={index} />
        )}
      </div>
    </div>
  );
}

/**
 * One list row. Memoized so changing the selection redraws two rows, not all ~1,900, which
 * would stall the entry-switch animations.
 */
const SpeciesRow = memo(function SpeciesRow({ dex, s, run, active }: { dex: Dex; s: Species; run: Run | null; active: boolean }) {
  return (
    <li>
      <a href={href("species", s.key)} className={active ? "active" : ""}>
        <PokeBall />
        <span className="dexno">{dexNo(s.dexNo)}</span>
        <span className="name">{s.name}</span>
        <span className="row-end">
          {run?.speciesOverrides[s.key] && (
            <>
              <VerdictMark ev={evaluateFor(dex, run, s.key)} />
              <span className="mark recorded" title="Randomized abilities recorded">
                ✎
              </span>
            </>
          )}
          <Types dex={dex} types={s.types} />
        </span>
      </a>
    </li>
  );
});

function SpeciesDetail({ dex, index }: { dex: Dex; index: number }) {
  const { run } = useRuns();
  const s = dex.species[index];
  const total = s.base.reduce((a, b) => a + b, 0);
  // The long move tables follow a moment later, so they don't hold up the switch animations.
  const movesIndex = useDeferredValue(index);
  // Replaying these classes on every switch gives the "screen refresh" effects.
  const topRef = useReplay<HTMLDivElement>(s.key, "scan");
  const plateRef = useReplay<HTMLDivElement>(s.key, "flash");
  const restRef = useReplay<HTMLDivElement>(s.key, "rise");
  const spriteRef = useReplay<HTMLDivElement>(s.key, "reveal");
  // Stat numbers and bars glide to the new species' values.
  const shownBase = useTween(s.base, { ms: 450 });
  const shownTotal = Math.round(shownBase.reduce((a, b) => a + b, 0));
  useEffect(() => {
    playCry(s.key);
  }, [s.key]);

  // Walk back to the first stage, then show the whole family from there.
  let root = index;
  const seen = new Set<number>();
  while (dex.species[root].prevo !== null && !seen.has(root)) {
    seen.add(root);
    root = dex.species[root].prevo!;
  }

  return (
    <article className="detail">
      <div className="dex-top" ref={topRef}>
        <div className="dex-left">
          <div className="nameplate" ref={plateRef} title={s.key}>
            <span className="dexno">No.{dexNo(s.dexNo)}</span>
            <span>{s.name}</span>
          </div>
          <div className="sprite-circle" ref={spriteRef}>
            <Sprite dex={dex} speciesKey={s.key} scale={3} />
          </div>
        </div>

        <div className="dex-right">
          <div className="plate info-plate">
            <div>
              <span className="label">Type</span>
              <Types dex={dex} types={s.types} />
            </div>
            <div>
              <span className="label">Height</span>
              <span>{s.height ? `${(s.height / 10).toFixed(1)} m` : "?"}</span>
            </div>
            <div>
              <span className="label">Weight</span>
              <span>{s.weight ? `${(s.weight / 10).toFixed(1)} kg` : "?"}</span>
            </div>
            <div>
              <span className="label">Base Stat Total</span>
              <span>
                {total} <TierBadge total={total} />
              </span>
            </div>
          </div>
          {s.dexText && (
            <div className="plate dex-entry">
              <p>{s.dexText}</p>
            </div>
          )}
        </div>
      </div>

      <div className="dex-sections" ref={restRef}>
        <section className="plate">
          <h2>Base stats</h2>
          <div className="stats-row">
            <table className="stats">
              <tbody>
                {s.base.map((v, i) => (
                  <tr key={i}>
                    <th>{STAT_NAMES[i]}</th>
                    <td className="num">{Math.round(shownBase[i])}</td>
                    <td className="bar-cell">
                      <div
                        className="bar"
                        style={{ width: `${Math.min(100, (Math.max(0, shownBase[i]) / 200) * 100)}%`, background: statColor(v) }}
                      />
                    </td>
                  </tr>
                ))}
                <tr>
                  <th>Total</th>
                  <td className="num">{shownTotal}</td>
                  <td />
                </tr>
              </tbody>
            </table>
            <StatRadar base={s.base} />
          </div>
        </section>
        <section className="plate">
          <h2>Randomized abilities</h2>
          {run ? (
            <>
              <Verdict dex={dex} run={run} ev={evaluateFor(dex, run, s.key)} />
              <AbilityEditor key={s.key} dex={dex} run={run} speciesKey={s.key} />
            </>
          ) : (
            <>
              <p className="hint">Start a run to record this species' randomized abilities.</p>
              <NewRunForm version={dex.version} />
            </>
          )}
          <h3 className="editor-title">Game defaults</h3>
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
        </section>
        <section className="plate">
          <h2>Evolutions</h2>
          <EvoTree dex={dex} index={root} current={index} path={[]} />
          {s.forms.length > 0 && (
            <p>
              Forms:{" "}
              {s.forms.map((f, i) => (
                <span key={f}>
                  {i > 0 && ", "}
                  <SpeciesLink dex={dex} index={f} />
                </span>
              ))}
            </p>
          )}
        </section>

        <MoveSections dex={dex} s={dex.species[movesIndex]} />
      </div>
    </article>
  );
}

// `path` holds the ancestors of this node so a looping evolution can't recurse forever.
// It is a fresh array per branch rather than a shared mutable set, because React may
// render a component more than once.
const MoveSections = memo(function MoveSections({ dex, s }: { dex: Dex; s: Species }) {
  return (
    <>
      <section className="plate">
        <h2>Level-up moves</h2>
        <MoveTable dex={dex} moves={s.lvl.map(([lv, m]) => ({ m, label: String(lv) }))} labelHeader="Lv" />
      </section>
      {s.tm.length > 0 && (
        <section className="plate">
          <h2>TM / HM moves</h2>
          <MoveTable dex={dex} moves={s.tm.map((m) => ({ m }))} />
        </section>
      )}
      {s.tutor.length > 0 && (
        <section className="plate">
          <h2>Tutor moves</h2>
          <MoveTable dex={dex} moves={s.tutor.map((m) => ({ m }))} />
        </section>
      )}
      {s.egg.length > 0 && (
        <section className="plate">
          <h2>Egg moves</h2>
          <MoveTable dex={dex} moves={s.egg.map((m) => ({ m }))} />
        </section>
      )}
    </>
  );
});

function EvoTree({ dex, index, current, path }: { dex: Dex; index: number; current: number; path: number[] }) {
  if (path.includes(index)) return null;
  const s = dex.species[index];
  return (
    <ul className="evo">
      <li>
        {index === current ? <strong>{s.name}</strong> : <SpeciesLink dex={dex} index={index} />}
        {s.evos.map((e) => (
          <div key={e.into} className="evo-step">
            <span className="muted">→ {e.how}</span>
            <EvoTree dex={dex} index={e.into} current={current} path={[...path, index]} />
          </div>
        ))}
      </li>
    </ul>
  );
}

function MoveTable({ dex, moves, labelHeader }: { dex: Dex; moves: { m: number; label?: string }[]; labelHeader?: string }) {
  return (
    <table className="moves">
      <thead>
        <tr>
          {labelHeader && <th>{labelHeader}</th>}
          <th>Move</th>
          <th>Type</th>
          <th>Split</th>
          <th className="num">Pwr</th>
          <th className="num">Acc</th>
          <th className="num">PP</th>
        </tr>
      </thead>
      <tbody>
        {moves.map(({ m, label }, i) => {
          const mv = dex.moves[m];
          return (
            <tr key={i} title={mv.desc}>
              {labelHeader && <td className="num">{label}</td>}
              <td>{mv.name}</td>
              <td>
                {[...new Set(mv.types)].map((t) => (
                  <TypeBadge key={t} name={dex.types[t]} />
                ))}
              </td>
              <td className="muted">{mv.split}</td>
              <td className="num">{mv.pwr || "—"}</td>
              <td className="num">{mv.acc || "—"}</td>
              <td className="num">{mv.pp}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function TierBadge({ total }: { total: number }) {
  const tier = bstTier(total);
  return (
    <span className={`tier tier-${tier}`} title={`Base Stat Total ${total}: tier ${tier}`}>
      {tier}
    </span>
  );
}

function statColor(v: number): string {
  if (v < 50) return "#e5534b";
  if (v < 80) return "#d29922";
  if (v < 110) return "#57ab5a";
  return "#39c5cf";
}

/** Step through species one after another, recording each one's randomized abilities. */
function BulkEntry({ dex }: { dex: Dex }) {
  const { run } = useRuns();
  const [round, setRound] = useState(0);
  const [text, setText] = useState("");
  const [species, setSpecies] = useState<string | null>(null);
  const [done, setDone] = useState<string[]>([]);

  const options: Option[] = useMemo(
    () => dex.species.slice(1).map((s) => ({ key: s.key, label: s.name, hint: run?.speciesOverrides[s.key] ? "recorded" : undefined })),
    [dex, run?.speciesOverrides],
  );
  if (!run) return null;

  const next = () => {
    if (species && run.speciesOverrides[species]) setDone((d) => [species, ...d.filter((k) => k !== species)]);
    setSpecies(null);
    setText("");
    setRound((r) => r + 1); // remounts the species box so it takes focus again
  };

  return (
    <article className="detail">
      <div className="nameplate">
        <span>Bulk entry</span>
      </div>
      <section className="plate bulk">
        <p className="hint">
          Pick a species, fill in its abilities (Tab moves between boxes, Enter picks), then Next. Everything saves as you type.
        </p>
        <div className="encounter-row">
          <Autocomplete
            key={round}
            options={options}
            value={text}
            onChange={(t) => {
              setText(t);
              setSpecies(null);
            }}
            onPick={(o) => {
              setText(o.label);
              setSpecies(o.key);
            }}
            placeholder="Species"
            autoFocus
          />
          <button className="btn primary" onClick={next} disabled={!species}>
            Next species
          </button>
        </div>
        {species && (
          <div className="bulk-species">
            <div className="preview-top">
              <Sprite dex={dex} speciesKey={species} scale={1} />
              <a href={href("species", species)}>{options.find((o) => o.key === species)?.label}</a>
            </div>
            <Verdict dex={dex} run={run} ev={evaluateFor(dex, run, species)} />
            <AbilityEditor key={species} dex={dex} run={run} speciesKey={species} autoFocus />
          </div>
        )}
      </section>
      {done.length > 0 && (
        <section className="plate">
          <h2>Recorded this session ({done.length})</h2>
          <ul className="chips">
            {done.map((k) => (
              <li key={k}>
                <a href={href("species", k)}>{options.find((o) => o.key === k)?.label ?? k}</a>{" "}
                <VerdictMark ev={evaluateFor(dex, run, k)} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
