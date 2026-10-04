// "Did you mean…" suggestions for a typed ability name that matches nothing.

import { normalizeName } from "./keys.ts";

function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
  }
  return row[b.length];
}

function commonPrefix(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
  return n;
}

/**
 * Up to `max` names closest to `text`: by edit distance on the whole name, or sharing a long
 * word start ("Prismatic Scales" -> "Prism Scales", "Prismatic Fur").
 */
export function suggestNames(text: string, names: string[], max = 3): string[] {
  const target = normalizeName(text);
  if (target.length < 3) return [];
  const words = text.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 4);
  const scored = names.map((name) => {
    const n = normalizeName(name);
    let score = distance(target, n);
    const nameWords = name.toLowerCase().split(/[^a-z0-9]+/);
    const shared = Math.max(0, ...words.flatMap((w) => nameWords.map((nw) => commonPrefix(w, nw))));
    if (shared >= 5) score = Math.min(score, target.length - shared);
    return { name, score };
  });
  const limit = Math.max(3, Math.floor(target.length * 0.45));
  return scored
    .filter((s) => s.score <= limit)
    .sort((a, b) => a.score - b.score || a.name.localeCompare(b.name))
    .slice(0, max)
    .map((s) => s.name);
}
