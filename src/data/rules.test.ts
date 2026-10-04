import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { containedIn, deepComponents, parseComposites, parseDescription } from "./composite.ts";
import { evaluate, flagFor } from "./flags.ts";
import { normalizeName } from "./keys.ts";
import { suggestNames } from "./suggest.ts";
import { indexDex } from "./load.ts";
import type { GameData } from "./types.ts";

// A tiny ability list; index 0 is the placeholder like in the real data.
const abilities = [
  { name: "-------", desc: "Empty." },
  { name: "Fur Coat", desc: "Halves physical damage." },
  { name: "Ice Scales", desc: "Halves special damage." },
  { name: "Protean", desc: "Changes type." },
  { name: "Color Change", desc: "Changes type when hit." },
  { name: "Prismatic Fur", desc: "Color Change + Protean + Fur Coat + Ice Scales." },
  { name: "Mega Fur", desc: "Prismatic Fur + 20% more HP." },
  { name: "Water Compaction", desc: "Takes 1/2 dmg from Water-type moves. +2 Def when hit by those." },
  { name: "Propeller Tail", desc: "Protean + Redirection Immunity." },
  { name: "RKS System", desc: "Held Memory determines its type. Also has Protean + Ice Scales." },
  { name: "Violent Rush", desc: "Boosts Speed by 50% + Attack by 20% on first turn." },
];
const byName = new Map(abilities.map((a, i) => [normalizeName(a.name), i] as const));

describe("composite parser", () => {
  const composites = parseComposites(abilities);

  it("splits 'A + B + C' into components", () => {
    expect(composites.get(5)).toEqual({ components: [4, 3, 1, 2], unknown: [] });
  });
  it("ignores stat boosts like '+2 Def'", () => {
    expect(composites.has(7)).toBe(false);
  });
  it("ignores plain effect text joined with +", () => {
    expect(composites.has(10)).toBe(false);
    expect(parseDescription("Spectralize + 30% chance to badly poison the foe.", new Map([["spectralize", 1]]))).toEqual({
      components: [1],
      unknown: [],
    });
  });
  it("marks name-like parts it can't find as unknown (unchecked)", () => {
    expect(composites.get(8)).toEqual({ components: [3], unknown: ["Redirection Immunity"] });
  });
  it("handles an 'Also has' clause after another sentence", () => {
    expect(composites.get(9)?.components).toEqual([3, 2]);
  });
  it("follows composites of composites", () => {
    expect(deepComponents(composites, 6).sort()).toEqual([1, 2, 3, 4, 5]);
    expect(containedIn(composites, 1).sort()).toEqual([5, 6]);
  });
  it("matches names ignoring case and punctuation", () => {
    expect(parseDescription("fur coat + ICE-SCALES.", byName)?.components).toEqual([1, 2]);
  });
});

// Ban flags and the stack rule, on a fake dex built from the tiny ability list.
function fakeDex() {
  const data: GameData = {
    version: "t",
    label: "t",
    sourceDate: "",
    types: ["Normal"],
    abilities: abilities.map((a) => ({ key: normalizeName(a.name), ...a })),
    moves: [],
    species: [
      { key: "SPECIES_NONE", name: "?", dexNo: 0, dexText: "", height: 0, weight: 0, types: [0], base: [1, 1, 1, 1, 1, 1], abis: [0, 0, 0], inns: [0, 0, 0], evos: [], prevo: null, lvl: [], tm: [], tutor: [], egg: [], forms: [] },
      { key: "SPECIES_TEST", name: "Test", dexNo: 1, dexText: "", height: 0, weight: 0, types: [0], base: [1, 1, 1, 1, 1, 1], abis: [3, 4, 0], inns: [1, 2, 7], evos: [], prevo: null, lvl: [], tm: [], tutor: [], egg: [], forms: [] },
    ],
    areas: [],
  };
  return indexDex(data);
}

describe("ban flags and stack rule", () => {
  const dex = fakeDex();

  it("flags a composite that contains a banned ability", () => {
    const f = flagFor(dex, dex.composites, { bans: ["furcoat"], limited: [] }, 6); // Mega Fur
    expect(f.rule).toBe("banned");
    expect(f.via).toContain(1);
  });
  it("a direct ban beats a limited component", () => {
    const f = flagFor(dex, dex.composites, { bans: ["prismaticfur"], limited: ["furcoat"] }, 5);
    expect(f).toMatchObject({ rule: "banned", via: [] });
  });
  it("uses game defaults when nothing is recorded", () => {
    const e = evaluate(dex, { bans: [], limited: ["furcoat"] }, 1, "SPECIES_TEST", undefined)!;
    expect(e.recorded).toBe(false);
    expect(e.limitedCount).toBe(1);
    expect(e.overLimit).toBe(false);
  });
  it("counts limited innates plus one for any limited ability slot", () => {
    const override = { abilities: ["furcoat", "icescales", ""], innates: ["furcoat", "icescales", "protean"] };
    const e = evaluate(dex, { bans: [], limited: ["furcoat", "icescales"] }, 1, "SPECIES_TEST", override)!;
    expect(e.recorded).toBe(true);
    expect(e.limitedCount).toBe(3); // 2 innates + 1 for the ability slots
    expect(e.overLimit).toBe(true);
  });
  it("reports banned abilities and unchecked composites", () => {
    const override = { abilities: ["prismaticfur", "", ""], innates: ["propellertail", "", ""] };
    const e = evaluate(dex, { bans: ["icescales"], limited: [] }, 1, "SPECIES_TEST", override)!;
    expect(e.banned.map((s) => s.ability.name)).toEqual(["Prismatic Fur"]);
    expect(e.unchecked.map((s) => s.ability.name)).toEqual(["Propeller Tail"]);
  });
  it("reports free-text abilities as unchecked", () => {
    const e = evaluate(dex, { bans: [], limited: [] }, 1, "SPECIES_TEST", { abilities: ["custom:Mystery Thing", "", ""], innates: ["", "", ""] })!;
    expect(e.abilities[0]?.ability).toMatchObject({ name: "Mystery Thing", index: null });
    expect(e.unchecked.map((s) => s.ability.name)).toEqual(["Mystery Thing"]);
  });
});

const file = "public/data/2.65beta.json";
describe.skipIf(!existsSync(file))("composites in the real 2.65beta data", () => {
  const dex = indexDex(JSON.parse(readFileSync(file, "utf8")) as GameData);
  const named = (n: string) => dex.abilities.findIndex((a) => a.name === n);
  it("parses Prismatic Fur", () => {
    expect(dex.composites.get(named("Prismatic Fur"))!.components.map((i) => dex.abilities[i].name)).toEqual([
      "Color Change", "Protean", "Fur Coat", "Ice Scales",
    ]);
  });
  it("banning Fur Coat flags Prismatic Fur", () => {
    expect(flagFor(dex, dex.composites, { bans: ["furcoat"], limited: [] }, named("Prismatic Fur")).rule).toBe("banned");
  });
});

describe("ability name suggestions", () => {
  const names = ["Prism Scales", "Prismatic Fur", "Ice Scales", "Fire Scales", "Multiscale", "Intimidate", "Speed Boost"];
  it("suggests close names for a misremembered one", () => {
    expect(suggestNames("Prismatic Scales", names).slice(0, 2).sort()).toEqual(["Prism Scales", "Prismatic Fur"]);
  });
  it("catches typos", () => {
    expect(suggestNames("Intimdate", names)[0]).toBe("Intimidate");
  });
  it("suggests nothing for unrelated text", () => {
    expect(suggestNames("Zzzz Qqqq", names)).toEqual([]);
  });
});
