// Base stat total tiers, best first. A species gets the first tier whose `min` its BST reaches.
// Cutoffs are set against Elite Redux 2.65 beta, where the median species has a BST around 505.
export const BST_TIERS = [
  { tier: "S", min: 600 }, // pseudo-legendaries, legendaries, megas
  { tier: "A", min: 540 },
  { tier: "B", min: 480 }, // typical fully evolved
  { tier: "C", min: 400 },
  { tier: "D", min: 300 },
  { tier: "E", min: 0 }, // first stages, babies
];

export function bstTier(total: number): string {
  return (BST_TIERS.find((t) => total >= t.min) ?? BST_TIERS[BST_TIERS.length - 1]).tier;
}
