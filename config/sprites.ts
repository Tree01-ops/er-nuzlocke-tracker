// Sprites come from the Elite Redux game source. The build script matches SPECIES_X keys to
// graphics/pokemon/<folders>/front.png by name; these aliases cover names that don't line up.
export const SPRITE_REPO = "Elite-Redux/eliteredux-source";
export const SPRITE_BRANCH = "upcoming";

export const SPRITE_ALIASES: Record<string, string> = {
  SPECIES_JAGGED_CHUNGULIS: "jagged_chungulus",
  SPECIES_ZYGARDE_10: "zygarde/10_percent",
  SPECIES_ZYGARDE_10_POWER_CONSTRUCT: "zygarde/10_percent",
  SPECIES_ZYGARDE_50_POWER_CONSTRUCT: "zygarde",
  SPECIES_UNOWN_EMARK: "unown/exclamation_mark",
  SPECIES_UNOWN_QMARK: "unown/question_mark",
};
