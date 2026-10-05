import { useMemo, useState } from "react";
import type { Evaluation, SlotFlag } from "../data/flags.ts";
import { CUSTOM_PREFIX, evaluate, flagFor, resolveRef } from "../data/flags.ts";
import { normalizeName } from "../data/keys.ts";
import { suggestNames } from "../data/suggest.ts";
import type { Dex } from "../data/load.ts";
import { isRealAbility } from "../data/load.ts";
import type { Run } from "../run/model.ts";
import { setOverride } from "../run/model.ts";
import { runStore } from "../run/store.ts";
import type { Option } from "./Autocomplete.tsx";
import { Autocomplete } from "./Autocomplete.tsx";
import { href } from "./route.ts";

export function evaluateFor(dex: Dex, run: Run, speciesKey: string): Evaluation | null {
  return evaluate(dex, run, run.rules.stackLimit, speciesKey, run.speciesOverrides[speciesKey]);
}

/** Status badge for one ability. Always icon + word, never colour alone. */
export function FlagBadge({ dex, flag }: { dex: Dex; flag: SlotFlag }) {
  const via = flag.via.length ? ` via ${flag.via.map((i) => dex.abilities[i].name).join(", ")}` : "";
  if (flag.rule === "banned") return <span className="flag banned" title={`Banned${via}`}>⛔ Banned</span>;
  if (flag.rule === "limited") return <span className="flag limited" title={`Counts toward the stack limit${via}`}>⚠ Limited</span>;
  if (flag.unchecked) return <span className="flag unchecked" title="A part of this composite couldn't be identified">? Unchecked</span>;
  return null;
}

/** Compact marker for list rows and the rail: the worst problem, if any. */
export function VerdictMark({ ev }: { ev: Evaluation | null }) {
  if (!ev) return null;
  if (ev.banned.length) return <span className="mark banned" title={`Banned: ${ev.banned.map((s) => s.ability.name).join(", ")}`}>⛔</span>;
  if (ev.overLimit) return <span className="mark limited" title={`${ev.limitedCount} limited abilities`}>⚠</span>;
  return null;
}

/** What to do about a species under the run's rules. */
export function Verdict({ dex, run, ev }: { dex: Dex; run: Run; ev: Evaluation | null }) {
  if (!ev) return null;
  const names = (slots: Evaluation["banned"]) =>
    slots
      .map((s) => s.ability.name + (s.flag.via.length ? ` (has ${s.flag.via.map((i) => dex.abilities[i].name).join(", ")})` : ""))
      .join(", ");
  const items = [];
  if (ev.banned.length) {
    items.push(
      <p key="b" className="verdict critical">
        ⛔ Banned ability: {names(ev.banned)}. {run.rules.rerollOnBan ? "Reroll this encounter." : "Box it."}
      </p>,
    );
  }
  if (ev.overLimit) {
    items.push(
      <p key="l" className="verdict warn">
        ⚠ {ev.limitedCount} limited abilities (limit {run.rules.stackLimit}): {names(ev.limited)}. Box it or reroll.
      </p>,
    );
  }
  const unknown = ev.unchecked.filter((s) => s.ability.index === null);
  const partial = ev.unchecked.filter((s) => s.ability.index !== null);
  if (unknown.length) {
    items.push(
      <p key="x" className="verdict warn">
        ⚠ Can't check {unknown.map((s) => `"${s.ability.name}"`).join(", ")}: not an ability in this data version, so bans
        don't apply. Pick the real name from the list.
      </p>,
    );
  }
  if (partial.length) {
    items.push(
      <p key="u" className="verdict note">
        ? Couldn't fully check {partial.map((s) => s.ability.name).join(", ")}. Read the description and decide.
      </p>,
    );
  }
  if (!items.length && ev.recorded) items.push(<p key="ok" className="verdict ok-box">✓ No flagged abilities.</p>);
  if (!ev.recorded) {
    items.push(
      <p key="d" className="hint">
        Not recorded yet, so this checks the game's default abilities.
      </p>,
    );
  }
  return <div className="verdicts">{items}</div>;
}

const SLOT_LABELS = ["Ability 1", "Ability 2", "Ability 3", "Innate 1", "Innate 2", "Innate 3"];

/**
 * The 3 ability + 3 innate inputs for a species' randomized abilities. Saves as you go.
 * Key it by species so the fields reset when the species changes.
 */
export function AbilityEditor({ dex, run, speciesKey, autoFocus }: { dex: Dex; run: Run; speciesKey: string; autoFocus?: boolean }) {
  const override = run.speciesOverrides[speciesKey];
  const refs = override ? [...override.abilities, ...override.innates] : ["", "", "", "", "", ""];
  const [texts, setTexts] = useState(() => refs.map((r) => resolveRef(dex, r)?.name ?? ""));

  const options: Option[] = useMemo(
    () =>
      dex.abilities.flatMap((a, i) => {
        if (!isRealAbility(dex, i)) return [];
        const rule = run.bans.includes(a.key) ? "banned" : run.limited.includes(a.key) ? "limited" : undefined;
        return [{ key: a.key, label: a.name, hint: rule }];
      }),
    [dex, run.bans, run.limited],
  );
  const byName = useMemo(() => new Map(dex.abilities.map((a, i) => [normalizeName(a.name), i])), [dex]);
  const abilityNames = useMemo(() => options.map((o) => o.label), [options]);

  const save = (slot: number, ref: string) => {
    const current = runStore.active()?.speciesOverrides[speciesKey];
    const all = current ? [...current.abilities, ...current.innates] : ["", "", "", "", "", ""];
    if (all[slot] === ref) return;
    all[slot] = ref;
    runStore.update((r) => setOverride(r, speciesKey, { abilities: all.slice(0, 3), innates: all.slice(3) }));
  };
  const commit = (slot: number, text: string) => {
    const t = text.trim();
    if (!t) return save(slot, "");
    // Already saved under this name (keeps the right one of two same-named abilities).
    const current = runStore.active()?.speciesOverrides[speciesKey];
    const currentRef = current ? [...current.abilities, ...current.innates][slot] : "";
    if (resolveRef(dex, currentRef)?.name === t) return;
    const i = byName.get(normalizeName(t));
    if (i !== undefined && i > 0) {
      setText(slot, dex.abilities[i].name);
      return save(slot, dex.abilities[i].key);
    }
    save(slot, CUSTOM_PREFIX + t);
  };
  const setText = (slot: number, text: string) => setTexts((ts) => ts.map((t, i) => (i === slot ? text : t)));

  return (
    <div className="ability-editor">
      {[0, 1].map((row) => (
        <div key={row} className="editor-row">
          <div className="label">{row === 0 ? "Abilities" : "Innates"}</div>
          {[0, 1, 2].map((col) => {
            const slot = row * 3 + col;
            const resolved = resolveRef(dex, refs[slot]);
            const flag = resolved ? flagFor(dex, dex.composites, run, resolved.index) : null;
            return (
              <div key={col} className="editor-cell">
                <Autocomplete
                  options={options}
                  value={texts[slot]}
                  placeholder={SLOT_LABELS[slot]}
                  onChange={(t) => setText(slot, t)}
                  onPick={(o) => {
                    setText(slot, o.label);
                    save(slot, o.key);
                  }}
                  onCommit={(t) => commit(slot, t)}
                  autoFocus={autoFocus && slot === 0}
                />
                {resolved && (
                  <div className="slot-info">
                    {flag && <FlagBadge dex={dex} flag={flag} />}
                    {resolved.index !== null ? (
                      <a href={href("abilities", resolved.ref)} className="slot-desc" data-ability={resolved.ref}>
                        {resolved.desc}
                      </a>
                    ) : (
                      <>
                        <span className="flag unchecked">? Unknown</span>
                        <span className="slot-desc muted">{resolved.missing ? "Not in this data version." : "Not in the ability list."}</span>
                        <Suggestions
                          names={suggestNames(resolved.name, abilityNames)}
                          onPick={(name) => {
                            const i = byName.get(normalizeName(name))!;
                            setText(slot, name);
                            save(slot, dex.abilities[i].key);
                          }}
                        />
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function Suggestions({ names, onPick }: { names: string[]; onPick: (name: string) => void }) {
  if (!names.length) return null;
  return (
    <span className="suggest">
      Did you mean{" "}
      {names.map((n, i) => (
        <span key={n}>
          {i > 0 && " / "}
          <button type="button" className="link-btn" onClick={() => onPick(n)}>
            {n}
          </button>
        </span>
      ))}
      ?
    </span>
  );
}

/**
 * Read-only list of a species' abilities and innates for this run: the recorded ones, or the
 * game defaults (marked as such) when nothing is recorded yet. Names carry tooltips.
 */
export function AbilitySummary({ dex, run, speciesKey }: { dex: Dex; run: Run; speciesKey: string }) {
  const ev = evaluateFor(dex, run, speciesKey);
  if (!ev) return null;
  const row = (label: string, slots: Evaluation["abilities"]) => (
    <div className="summary-row">
      <span className="label">{label}</span>
      {slots.map((s, i) => (
        <span key={i} className="summary-slot">
          {i > 0 && <span className="muted"> · </span>}
          {!s ? (
            <span className="muted">—</span>
          ) : s.ability.index !== null ? (
            <a href={href("abilities", s.ability.ref)} data-ability={s.ability.ref} className={`rule-${s.flag.rule}`}>
              {s.flag.rule === "banned" ? "⛔ " : s.flag.rule === "limited" ? "⚠ " : ""}
              {s.ability.name}
            </a>
          ) : (
            <span className="muted" title="Not an ability in this data version">
              {s.ability.name}?
            </span>
          )}
        </span>
      ))}
    </div>
  );
  return (
    <div className={`ability-summary${ev.recorded ? "" : " dimmed"}`}>
      {row("Abilities", ev.abilities)}
      {row("Innates", ev.innates)}
      {!ev.recorded && <div className="hint">Game defaults, randomized abilities not recorded.</div>}
    </div>
  );
}
