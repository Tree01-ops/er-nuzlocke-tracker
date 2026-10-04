import type { Composite } from "./composite.ts";
import { parseComposites } from "./composite.ts";
import type { GameData, SpriteEntry, VersionInfo } from "./types.ts";

/** Game data plus lookups the UI needs. Built once per version. */
export type Dex = GameData & {
  speciesByKey: Map<string, number>;
  abilityByKey: Map<string, number>;
  /** ability index -> species indexes that have it as a regular ability / as an innate */
  abilityUsers: Map<number, { abis: number[]; inns: number[] }>;
  /** Species key -> sprite info. Empty if the sprites haven't been built. */
  sprites: Record<string, SpriteEntry>;
  /** Ability index -> parsed "A + B" components. See composite.ts. */
  composites: Map<number, Composite>;
};

const base = import.meta.env.BASE_URL;
const cache = new Map<string, Promise<Dex>>();

export async function loadVersions(): Promise<VersionInfo[]> {
  const res = await fetch(`${base}data/versions.json`);
  if (!res.ok) throw new Error(`Could not load versions.json (${res.status}). Did you run "npm run data"?`);
  return res.json();
}

export function loadDex(version: string): Promise<Dex> {
  if (!cache.has(version)) {
    cache.set(
      version,
      fetch(`${base}data/${version}.json`).then(async (res) => {
        if (!res.ok) throw new Error(`Could not load data for ${version} (${res.status})`);
        const [data, sprites] = await Promise.all([res.json() as Promise<GameData>, loadSprites()]);
        return indexDex(data, sprites);
      }),
    );
  }
  return cache.get(version)!;
}

let spriteIndex: Promise<Record<string, SpriteEntry>> | null = null;
function loadSprites(): Promise<Record<string, SpriteEntry>> {
  spriteIndex ??= fetch(`${base}sprites/index.json`)
    .then((res) => (res.ok ? res.json() : {}))
    .catch(() => ({}));
  return spriteIndex;
}

export function indexDex(data: GameData, sprites: Record<string, SpriteEntry> = {}): Dex {
  const speciesByKey = new Map(data.species.map((s, i) => [s.key, i]));
  const abilityByKey = new Map(data.abilities.map((a, i) => [a.key, i]));
  const abilityUsers = new Map<number, { abis: number[]; inns: number[] }>();
  const users = (a: number) => {
    if (!abilityUsers.has(a)) abilityUsers.set(a, { abis: [], inns: [] });
    return abilityUsers.get(a)!;
  };
  data.species.forEach((s, i) => {
    if (i === 0) return; // placeholder
    for (const a of new Set(s.abis)) if (a > 0) users(a).abis.push(i);
    for (const a of new Set(s.inns)) if (a > 0) users(a).inns.push(i);
  });
  const composites = parseComposites(data.abilities);
  return { ...data, speciesByKey, abilityByKey, abilityUsers, sprites, composites };
}

/** True for real entries; index 0 of species and abilities is a placeholder. */
export function isRealAbility(dex: Dex, i: number): boolean {
  return i > 0 && dex.abilities[i]?.name !== "-------";
}
