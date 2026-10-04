import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { abilityKeys, normalizeName, slugify } from "./keys.ts";
import { indexDex } from "./load.ts";
import type { GameData } from "./types.ts";

describe("keys", () => {
  it("normalizes names that differ only in punctuation", () => {
    expect(normalizeName("Multi-Headed")).toBe(normalizeName("Multi Headed"));
  });
  it("disambiguates repeated ability names", () => {
    expect(abilityKeys(["As One", "Stench", "As One"])).toEqual(["asone", "stench", "asone#2"]);
  });
  it("slugifies area names", () => {
    expect(slugify("Route 111 Desert")).toBe("route-111-desert");
  });
});

// Guards the index-vs-id gotcha: references in the built data must be array indexes.
const file = "public/data/2.65beta.json";
describe.skipIf(!existsSync(file))("built 2.65beta data", () => {
  const dex = indexDex(JSON.parse(readFileSync(file, "utf8")) as GameData);
  const sp = (name: string) => dex.species.find((s) => s.name === name)!;
  const abil = (i: number) => dex.abilities[i].name;

  it("resolves species abilities by index", () => {
    expect(sp("Azumarill").inns.map(abil)).toContain("Huge Power");
  });
  it("resolves abilities whose index differs from their game id", () => {
    // Spectralize sits at index 386 but has game id 393.
    const i = dex.abilities.findIndex((a) => a.name === "Spectralize");
    expect(i).toBe(386);
    expect(dex.abilityUsers.get(i)?.abis.length ?? 0).toBeGreaterThan(0);
  });
  it("resolves evolutions and prevos", () => {
    const ivy = sp("Ivysaur");
    expect(dex.species[ivy.prevo!].name).toBe("Bulbasaur");
    expect(dex.species[ivy.evos[0].into].name).toBe("Venusaur");
  });
  it("puts Route 101 encounters in Route 101", () => {
    const area = dex.areas.find((a) => a.key === "route-101")!;
    expect(area.methods.find((m) => m.method === "land")!.slots.length).toBeGreaterThan(0);
  });
  it("has no unsorted areas", () => {
    expect(dex.areas.filter((a) => a.group === "Unsorted").map((a) => a.name)).toEqual([]);
  });
});
