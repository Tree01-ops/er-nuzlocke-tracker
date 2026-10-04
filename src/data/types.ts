// Shape of the trimmed per-version data files in public/data/<version>.json.
// Written by scripts/build-data.ts, read by the app. All numeric references
// (species, moves, abilities, types) are indexes into the arrays of the same file.

export type GameData = {
  version: string;
  label: string;
  /** When ER-nextdex generated the source file (ISO date). */
  sourceDate: string;
  types: string[];
  abilities: Ability[];
  moves: Move[];
  species: Species[];
  areas: Area[];
};

export type Ability = {
  /** Stable across versions: normalized name, plus a suffix for duplicate names. See abilityKey(). */
  key: string;
  name: string;
  desc: string;
};

export type Move = {
  name: string;
  types: number[];
  /** "Physical", "Special", "Status", or one of ER's special splits such as "Hits Def". */
  split: string;
  pwr: number;
  acc: number;
  pp: number;
  prio: number;
  desc: string;
};

export type Species = {
  /** Game constant such as SPECIES_BULBASAUR; stable across versions. */
  key: string;
  name: string;
  /** National dex number; forms and megas share their base species' number. 0 if unknown. */
  dexNo: number;
  /** Pokédex entry text, height in decimetres, weight in hectograms (as the game stores them). */
  dexText: string;
  height: number;
  weight: number;
  types: number[];
  /** HP, Atk, Def, SpA, SpD, Spe */
  base: number[];
  /** 3 ability slots; 0 means empty. */
  abis: number[];
  /** 3 innate slots; 0 means empty. */
  inns: number[];
  evos: { into: number; how: string }[];
  prevo: number | null;
  /** [level, move] */
  lvl: [number, number][];
  tm: number[];
  tutor: number[];
  egg: number[];
  forms: number[];
};

export type EncounterMethod =
  | "land"
  | "surf"
  | "oldRod"
  | "goodRod"
  | "superRod"
  | "rockSmash"
  | "honey"
  | "hidden";

export type EncounterSlot = { spc: number; min: number; max: number; rate: number };

export type Area = {
  /** Slug of the area name; stable across versions. */
  key: string;
  name: string;
  group: string;
  /** Game map names merged into this area. */
  maps: string[];
  methods: { method: EncounterMethod; slots: EncounterSlot[] }[];
  statics: { spc: number; how: string[]; map: string }[];
};

export type VersionInfo = { id: string; label: string };

/** public/sprites/index.json: species key -> what the sprite files look like. */
export type SpriteEntry = {
  /** 64x128 sheet; show the top half. */
  anim?: true;
  /** No sprite of its own; this is the base form's. */
  base?: true;
  /** Has a 32x64 menu icon (two frames). */
  icon?: true;
};
