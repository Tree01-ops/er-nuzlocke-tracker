// Ban flags for abilities and the stack rule for a species.
//
// Each ability is allowed, "limited" (counts toward the stack limit) or "banned" (the
// Pokémon must be rerolled or boxed). A composite inherits the strictest rule of the
// abilities it contains, so banning Fur Coat bans Prismatic Fur too.
//
// Stack rule: a Pokémon has all three innates plus ONE of its three ability slots active.
// We don't know which slot a given catch has, so the count is the worst case:
// limited innates + 1 if any recorded ability slot is limited.

import type { Composite } from "./composite.ts";
import { deepComponents } from "./composite.ts";
import type { Dex } from "./load.ts";

export type AbilityRule = "allowed" | "limited" | "banned";

export type RuleLists = { bans: string[]; limited: string[] };

export type SlotFlag = {
  rule: AbilityRule;
  /** For composites: the component abilities that caused the rule. Empty if it's direct. */
  via: number[];
  /** Can't be checked automatically: free text, or a composite with an unidentified part. */
  unchecked: boolean;
};

export const CUSTOM_PREFIX = "custom:";

/** A recorded ability: a known ability (by key) or free text the data doesn't know. */
export type ResolvedAbility = { ref: string; index: number | null; name: string; desc: string; missing: boolean };

export function resolveRef(dex: Dex, ref: string): ResolvedAbility | null {
  if (!ref) return null;
  if (ref.startsWith(CUSTOM_PREFIX)) {
    return { ref, index: null, name: ref.slice(CUSTOM_PREFIX.length), desc: "", missing: false };
  }
  const index = dex.abilityByKey.get(ref);
  if (index === undefined) return { ref, index: null, name: ref, desc: "", missing: true };
  return { ref, index, name: dex.abilities[index].name, desc: dex.abilities[index].desc, missing: false };
}

export function directRule(lists: RuleLists, key: string): AbilityRule {
  if (lists.bans.includes(key)) return "banned";
  if (lists.limited.includes(key)) return "limited";
  return "allowed";
}

export function flagFor(dex: Dex, composites: Map<number, Composite>, lists: RuleLists, index: number | null): SlotFlag {
  if (index === null) return { rule: "allowed", via: [], unchecked: false };
  const key = dex.abilities[index].key;
  const unchecked = (composites.get(index)?.unknown.length ?? 0) > 0;
  const direct = directRule(lists, key);
  if (direct !== "allowed") return { rule: direct, via: [], unchecked };
  const parts = deepComponents(composites, index);
  const banned = parts.filter((p) => lists.bans.includes(dex.abilities[p].key));
  if (banned.length) return { rule: "banned", via: banned, unchecked };
  const limited = parts.filter((p) => lists.limited.includes(dex.abilities[p].key));
  if (limited.length) return { rule: "limited", via: limited, unchecked };
  return { rule: "allowed", via: [], unchecked };
}

export type Slot = { ability: ResolvedAbility; flag: SlotFlag };

export type Evaluation = {
  /** True when the abilities come from the run's recorded overrides, not the game defaults. */
  recorded: boolean;
  abilities: (Slot | null)[];
  innates: (Slot | null)[];
  banned: Slot[];
  limited: Slot[];
  /** Worst-case count for the stack rule (see top of file). */
  limitedCount: number;
  overLimit: boolean;
  unchecked: Slot[];
};

export function evaluate(
  dex: Dex,
  lists: RuleLists,
  stackLimit: number,
  speciesKey: string,
  override: { abilities: string[]; innates: string[] } | undefined,
): Evaluation | null {
  const index = dex.speciesByKey.get(speciesKey);
  const species = index !== undefined ? dex.species[index] : null;
  const recorded = !!override && [...override.abilities, ...override.innates].some(Boolean);
  if (!species && !recorded) return null;

  const fromIndex = (i: number) => (i > 0 ? dex.abilities[i].key : "");
  const abilityRefs = recorded ? override!.abilities : species!.abis.map(fromIndex);
  const innateRefs = recorded ? override!.innates : species!.inns.map(fromIndex);

  const slot = (ref: string): Slot | null => {
    const ability = resolveRef(dex, ref);
    if (!ability) return null;
    const flag = flagFor(dex, dex.composites, lists, ability.index);
    // Free text (or a key missing from this version) can't be checked against the ban lists.
    if (ability.index === null) flag.unchecked = true;
    return { ability, flag };
  };
  const abilities = pad(abilityRefs).map(slot);
  const innates = pad(innateRefs).map(slot);
  const all = [...abilities, ...innates].filter((s): s is Slot => !!s);

  const limitedCount =
    innates.filter((s) => s?.flag.rule === "limited").length +
    (abilities.some((s) => s?.flag.rule === "limited") ? 1 : 0);

  return {
    recorded,
    abilities,
    innates,
    banned: all.filter((s) => s.flag.rule === "banned"),
    limited: all.filter((s) => s.flag.rule === "limited"),
    limitedCount,
    overLimit: stackLimit >= 0 && limitedCount > stackLimit,
    unchecked: all.filter((s) => s.flag.unchecked && s.flag.rule === "allowed"),
  };
}

function pad(refs: string[]): string[] {
  return [0, 1, 2].map((i) => refs[i] ?? "");
}
