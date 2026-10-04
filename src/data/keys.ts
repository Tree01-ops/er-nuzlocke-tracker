// Stable keys that survive data version changes. Run data stores these, never array indexes.

/** "Multi-Headed", "Multi Headed" and "multiheaded" all normalize to "multiheaded". */
export function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Keys for a list of ability names, in order. Unique names get the normalized name.
 * Repeated names (the game has two "As One" and four "Embody Aspect") get "#2", "#3"...
 * on the second and later copies.
 */
export function abilityKeys(names: string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((name) => {
    const base = normalizeName(name);
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base}#${count}`;
  });
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
