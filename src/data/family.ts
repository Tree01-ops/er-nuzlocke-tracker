import type { Dex } from "./load.ts";

/** Index of the first stage of a species' evolution family (megas and forms included). */
export function familyRoot(dex: Dex, index: number): number {
  let root = index;
  const seen = new Set<number>();
  while (dex.species[root]?.prevo != null && !seen.has(root)) {
    seen.add(root);
    root = dex.species[root].prevo!;
  }
  return root;
}

/**
 * For the duplicates clause: the caught Pokémon (alive or dead) that share a family with
 * `speciesKey`. Empty when there is no duplicate.
 */
export function familyDuplicates(dex: Dex, speciesKey: string, owned: { id: string; species: string }[]): string[] {
  const i = dex.speciesByKey.get(speciesKey);
  if (i === undefined) return [];
  const root = familyRoot(dex, i);
  return owned
    .filter((m) => {
      const j = dex.speciesByKey.get(m.species);
      return j !== undefined && familyRoot(dex, j) === root;
    })
    .map((m) => m.id);
}
