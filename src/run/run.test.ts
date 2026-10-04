import { describe, expect, it } from "vitest";
import { fromCode, fromExportJson, toCode, toExportJson } from "./codec.ts";
import {
  catchMon,
  createRun,
  killMon,
  markExported,
  needsBackup,
  moveMon,
  PARTY_SIZE,
  placeOf,
  releaseMon,
  reopenArea,
  rerollEncounter,
  shiftInParty,
} from "./model.ts";

const fresh = () => createRun("Test", "2.65beta");

describe("run model", () => {
  it("catches into the party, then the box once the party is full", () => {
    let run = fresh();
    for (let i = 0; i < PARTY_SIZE + 1; i++) run = catchMon(run, `area-${i}`, "SPECIES_ZIGZAGOON");
    expect(run.party).toHaveLength(PARTY_SIZE);
    expect(run.box).toHaveLength(1);
    expect(run.areas["area-6"].status).toBe("caught");
  });

  it("keeps the area open on reroll and logs the thrown-back species", () => {
    let run = rerollEncounter(fresh(), "route-101", "SPECIES_WURMPLE");
    expect(run.areas["route-101"].status).toBeUndefined();
    run = catchMon(run, "route-101", "SPECIES_POOCHYENA");
    expect(run.areas["route-101"].rerolls).toEqual([{ species: "SPECIES_WURMPLE", outcome: "rerolled" }]);
  });

  it("moves a dead Pokémon to the graveyard with its cause", () => {
    let run = catchMon(fresh(), "route-101", "SPECIES_ZIGZAGOON");
    const id = run.party[0];
    run = killMon(run, id, "Crit from Roxanne");
    expect(placeOf(run, id)).toBe("graveyard");
    expect(run.party).toEqual([]);
    expect(run.graveyard[0].cause).toBe("Crit from Roxanne");
  });

  it("refuses to move into a full party", () => {
    let run = fresh();
    for (let i = 0; i < PARTY_SIZE + 1; i++) run = catchMon(run, `a${i}`, "SPECIES_ZIGZAGOON");
    const boxed = run.box[0];
    expect(moveMon(run, boxed, "party")).toBe(run);
    run = moveMon(run, run.party[0], "box");
    expect(placeOf(moveMon(run, boxed, "party"), boxed)).toBe("party");
  });

  it("reopening an area removes its Pokémon but keeps notes and rerolls", () => {
    let run = rerollEncounter(fresh(), "r", "SPECIES_A");
    run = catchMon(run, "r", "SPECIES_B");
    run = { ...run, areas: { ...run.areas, r: { ...run.areas.r, notes: "hi" } } };
    run = reopenArea(run, "r");
    expect(run.party).toEqual([]);
    expect(Object.keys(run.mons)).toEqual([]);
    expect(run.areas.r).toEqual({ notes: "hi", rerolls: [{ species: "SPECIES_A", outcome: "rerolled" }] });
  });

  it("releasing a Pokémon removes it and reopens its route", () => {
    let run = catchMon(fresh(), "route-101", "SPECIES_ZIGZAGOON");
    run = killMon(run, run.party[0], "oops");
    run = releaseMon(run, run.graveyard[0].monId);
    expect(run.graveyard).toEqual([]);
    expect(Object.keys(run.mons)).toEqual([]);
    expect(run.areas["route-101"].status).toBeUndefined();
  });

  it("reorders the party", () => {
    let run = catchMon(fresh(), "a", "SPECIES_A");
    run = catchMon(run, "b", "SPECIES_B");
    const [first, second] = run.party;
    expect(shiftInParty(run, second, -1).party).toEqual([second, first]);
  });
});

describe("backup reminder", () => {
  const DAY = 86_400_000;
  it("waits until a new run has some progress", () => {
    const run = createRun("t", "v", 0);
    expect(needsBackup({ ...run, updatedAt: 1 }, 1000)).toBe(false);
    expect(needsBackup({ ...run, updatedAt: 1 }, 2 * DAY)).toBe(true);
  });
  it("stays quiet for a week after an export, and when nothing changed", () => {
    const run = markExported({ ...createRun("t", "v", 0), updatedAt: 5 }, 10);
    expect(needsBackup(run, 3 * DAY)).toBe(false); // nothing changed since export
    const changed = { ...run, updatedAt: 20 };
    expect(needsBackup(changed, 3 * DAY)).toBe(false);
    expect(needsBackup(changed, 8 * DAY)).toBe(true);
  });
});

describe("export codec", () => {
  const run = catchMon(fresh(), "route-101", "SPECIES_ZIGZAGOON", "Ziggy");

  it("round-trips through a JSON file", () => {
    expect(fromExportJson(toExportJson(run))).toEqual(run);
  });
  it("round-trips through a short code", async () => {
    const code = await toCode(run);
    expect(code.startsWith("ERN1.")).toBe(true);
    expect(await fromCode(code)).toEqual(run);
  });
  it("rejects things that aren't exports", async () => {
    expect(() => fromExportJson('{"hello":1}')).toThrow("isn't an ER Nuzlocke export");
    await expect(fromCode("ERN1.garbage")).rejects.toThrow("damaged");
  });
});
