import { useState } from "react";
import type { Dex } from "../data/load.ts";
import type { Place, Run } from "../run/model.ts";
import { killMon, moveMon, PARTY_SIZE, releaseMon, renameMon, shiftInParty } from "../run/model.ts";
import { runStore } from "../run/store.ts";
import { Sprite, Types } from "./common.tsx";
import { evaluateFor, VerdictMark } from "./Flags.tsx";
import { href } from "./route.ts";

/** Display name of a species key in this data version, or a readable fallback. */
export function speciesName(dex: Dex, key: string): string {
  const i = dex.speciesByKey.get(key);
  if (i !== undefined) return dex.species[i].name;
  return key.replace(/^SPECIES_/, "").toLowerCase().replace(/(^|_)(\w)/g, (_, sep, c) => (sep ? " " : "") + c.toUpperCase());
}

/**
 * One Pokémon with its actions. `full` adds reordering and nickname editing (Run panel);
 * the rail uses the compact form.
 */
export function MonRow({ dex, run, monId, place, full }: { dex: Dex; run: Run; monId: string; place: Place; full?: boolean }) {
  const mon = run.mons[monId];
  const [mode, setMode] = useState<"idle" | "dying" | "renaming">("idle");
  const [text, setText] = useState("");
  if (!mon) return null;

  const index = dex.speciesByKey.get(mon.species);
  const species = index !== undefined ? dex.species[index] : null;
  const name = speciesName(dex, mon.species);
  const grave = place === "graveyard" ? run.graveyard.find((g) => g.monId === monId) : undefined;
  const partyFull = run.party.length >= PARTY_SIZE;
  const update = runStore.update;

  return (
    <li className={`mon ${place}`}>
      <div className="mon-main">
        <Sprite dex={dex} speciesKey={mon.species} kind="icon" bob={place === "party"} />
        <div className="mon-names">
          <span className="mon-nick">
            {mon.nickname ?? name} {place !== "graveyard" && <VerdictMark ev={evaluateFor(dex, run, mon.species)} />}
          </span>
          <a className="mon-species" href={href("species", mon.species)}>
            {mon.nickname ? name : ""}
            {!species && <span className="muted"> (not in this version)</span>}
          </a>
        </div>
        {full && species && <Types dex={dex} types={species.types} />}
      </div>

      {grave?.cause && <div className="mon-cause">✝ {grave.cause}</div>}

      {mode === "idle" ? (
        <div className="mon-actions">
          {full && place === "party" && (
            <>
              <button className="btn small" title="Move up" onClick={() => update((r) => shiftInParty(r, monId, -1))}>
                ↑
              </button>
              <button className="btn small" title="Move down" onClick={() => update((r) => shiftInParty(r, monId, 1))}>
                ↓
              </button>
            </>
          )}
          {place === "party" && (
            <button className="btn small" onClick={() => update((r) => moveMon(r, monId, "box"))}>
              Box
            </button>
          )}
          {place === "box" && (
            <button
              className="btn small"
              disabled={partyFull}
              title={partyFull ? "Party is full" : undefined}
              onClick={() => update((r) => moveMon(r, monId, "party"))}
            >
              Party
            </button>
          )}
          {place !== "graveyard" && (
            <button
              className="btn small danger"
              onClick={() => {
                setText("");
                setMode("dying");
              }}
            >
              Fainted
            </button>
          )}
          {place === "graveyard" && (
            <button
              className="btn small"
              title="Mistake? Puts it back in the box"
              onClick={() => update((r) => moveMon(r, monId, "box"))}
            >
              Undo death
            </button>
          )}
          {full && (
            <button
              className="btn small"
              onClick={() => {
                setText(mon.nickname ?? "");
                setMode("renaming");
              }}
            >
              Rename
            </button>
          )}
          {full && (
            <button
              className="btn small danger"
              title="Take it out of the run; its route opens again"
              onClick={() => {
                if (confirm(`Release ${mon.nickname ?? name}? It's removed from the run and its route opens again.`)) {
                  update((r) => releaseMon(r, monId));
                }
              }}
            >
              Release
            </button>
          )}
        </div>
      ) : (
        <form
          className="mon-form"
          onSubmit={(e) => {
            e.preventDefault();
            update((r) => (mode === "dying" ? killMon(r, monId, text) : renameMon(r, monId, text)));
            setMode("idle");
          }}
        >
          <input
            autoFocus
            value={text}
            placeholder={mode === "dying" ? "Cause (optional)" : "Nickname"}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setMode("idle")}
          />
          <button className={`btn small ${mode === "dying" ? "danger" : "primary"}`} type="submit">
            {mode === "dying" ? "Confirm" : "Save"}
          </button>
          <button className="btn small" type="button" onClick={() => setMode("idle")}>
            Cancel
          </button>
        </form>
      )}
    </li>
  );
}

export function MonList({ dex, run, place, full }: { dex: Dex; run: Run; place: Place; full?: boolean }) {
  const ids = place === "graveyard" ? run.graveyard.map((g) => g.monId) : run[place];
  if (!ids.length) return <p className="muted">Empty</p>;
  return (
    <ul className="mons">
      {ids.map((id) => (
        <MonRow key={id} dex={dex} run={run} monId={id} place={place} full={full} />
      ))}
    </ul>
  );
}
