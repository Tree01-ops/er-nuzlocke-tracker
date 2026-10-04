// Composite abilities: Elite Redux describes many abilities as "A + B + C", e.g.
// Prismatic Fur = "Color Change + Protean + Fur Coat + Ice Scales." Banning Fur Coat should
// flag Prismatic Fur, so we parse those descriptions into component abilities.
//
// Rules:
// - Only a plus with spaces around it separates parts ("+2 Def" is a stat boost, not a part).
// - A clause may start with "Also has" (RKS System: "... Also has Protean + Adaptability.").
// - A part that is a known ability name (ignoring case and punctuation) is a component.
// - A part that looks like an ability name but isn't one ("Redirection Immunity",
//   "Chilling Neigh") makes the ability "unchecked": it needs a human to review it.
// - Any other part is plain effect text ("30% chance to badly poison the foe") and is ignored.

import { normalizeName } from "./keys.ts";

export type Composite = {
  /** Indexes of component abilities, in description order. */
  components: number[];
  /** Parts that look like ability names but match none. Non-empty means "unchecked". */
  unknown: string[];
};

const NAME_LIKE = /^[A-Z][\w'-]*(\s[A-Z][\w'-]*){0,3}$/;

export function parseComposites(abilities: { name: string; desc: string }[]): Map<number, Composite> {
  const byName = new Map<string, number>();
  abilities.forEach((a, i) => {
    const n = normalizeName(a.name);
    if (i > 0 && n && !byName.has(n)) byName.set(n, i);
  });

  const result = new Map<number, Composite>();
  abilities.forEach((a, i) => {
    if (i === 0) return;
    const parsed = parseDescription(a.desc, byName, i);
    if (parsed) result.set(i, parsed);
  });
  return result;
}

export function parseDescription(desc: string, byName: Map<string, number>, self = -1): Composite | null {
  const components: number[] = [];
  const unknown: string[] = [];
  for (const clause of desc.split(/[.;:]\s+|[.;]$/)) {
    if (!/\s\+\s/.test(clause)) continue;
    const body = clause.trim().replace(/^(also has|also)\s+/i, "");
    for (const raw of body.split(/\s\+\s/)) {
      const part = raw.trim().replace(/\.$/, "");
      const index = byName.get(normalizeName(part));
      if (index !== undefined && index !== self) {
        if (!components.includes(index)) components.push(index);
      } else if (NAME_LIKE.test(part)) {
        unknown.push(part);
      }
    }
  }
  return components.length || unknown.length ? { components, unknown } : null;
}

/** All abilities an ability contains, following composites of composites. */
export function deepComponents(composites: Map<number, Composite>, index: number): number[] {
  const out: number[] = [];
  const visit = (i: number) => {
    for (const c of composites.get(i)?.components ?? []) {
      if (c === index || out.includes(c)) continue;
      out.push(c);
      visit(c);
    }
  };
  visit(index);
  return out;
}

/** Abilities whose composite (directly or deeply) contains `index`. */
export function containedIn(composites: Map<number, Composite>, index: number): number[] {
  const out: number[] = [];
  for (const i of composites.keys()) if (deepComponents(composites, i).includes(index)) out.push(i);
  return out;
}
