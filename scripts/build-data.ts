// Downloads ER-nextdex game data, trims it, and writes public/data/<version>.json.
//
//   npm run data            build from cached downloads (downloads what is missing)
//   npm run data:refresh    re-download everything first
//
// Facts about the source format this relies on (checked against ER-nextdex src/compactify.ts):
// - Every cross-reference (species abis/inns, moves, evolutions, encounter slots)
//   is an ARRAY INDEX. The `id` fields are internal game IDs and are not used here.
// - locations.maps[].id indexes mapsT (area names). Several map entries can share one name.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { AREA_ORDER, IGNORED_MAPS } from "../config/areas.ts";
import { DATA_URL, VERSIONS } from "../config/versions.ts";
import { abilityKeys, slugify } from "../src/data/keys.ts";
import type {
  Area,
  EncounterMethod,
  EncounterSlot,
  GameData,
  Species,
} from "../src/data/types.ts";

const CACHE = ".cache";
const OUT = "public/data";
const refresh = process.argv.includes("--refresh");

type Raw = any;

async function load(file: string): Promise<Raw> {
  const path = `${CACHE}/gameData${file}.json`;
  if (refresh || !existsSync(path)) {
    const url = `${DATA_URL}${file}.json`;
    console.log(`Downloading ${url}`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status} fetching ${url}`);
    mkdirSync(CACHE, { recursive: true });
    writeFileSync(path, await res.text());
  }
  return JSON.parse(readFileSync(path, "utf8"));
}

/** "ITEM_FIRE_STONE" -> "Fire Stone", "EVO_LEVEL_MALE" -> "Level Male" */
function pretty(constant: string): string {
  return constant
    .replace(/^(ITEM|MOVE|EVO|SPECIES)_/, "")
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function evoText(kind: string, reason: string): string {
  const k = pretty(kind);
  const r = /^\d+$/.test(reason) ? reason : pretty(reason);
  if (kind === "EVO_LEVEL") return `Level ${r}`;
  return r ? `${k}: ${r}` : k;
}

const SPLITS: Record<string, string> = {
  PHYSICAL: "Physical",
  SPECIAL: "Special",
  STATUS: "Status",
};

function build(raw: Raw, version: (typeof VERSIONS)[number]): GameData {
  const mapsT: string[] = raw.mapsT;

  const keys = abilityKeys(raw.abilities.map((a: Raw) => a.name));
  const abilities = raw.abilities.map((a: Raw, i: number) => ({
    key: keys[i],
    name: a.name,
    desc: a.desc,
  }));

  const moves = raw.moves.map((m: Raw) => ({
    name: m.name,
    types: m.types,
    split: SPLITS[raw.splitT[m.split]] ?? pretty(raw.splitT[m.split] ?? "STATUS"),
    pwr: m.pwr,
    acc: m.acc,
    pp: m.pp,
    prio: m.prio,
    desc: m.lDesc || m.desc,
  }));
  const validMove = (i: number) => i >= 0 && i < moves.length;

  const species: Species[] = raw.species.map((s: Raw) => ({
    key: s.NAME,
    name: s.name,
    dexNo: s.dex?.id ?? 0,
    dexText: s.dex?.desc ?? "",
    height: s.dex?.hw?.[0] ?? 0,
    weight: s.dex?.hw?.[1] ?? 0,
    types: s.stats.types,
    base: s.stats.base,
    abis: s.stats.abis.length ? s.stats.abis : [0, 0, 0],
    inns: s.stats.inns.length ? s.stats.inns : [0, 0, 0],
    evos: s.evolutions
      .filter((e: Raw) => e.in >= 0)
      .map((e: Raw) => ({ into: e.in, how: evoText(raw.evoKindT[e.kd], String(e.rs ?? "")) })),
    prevo: null,
    lvl: s.levelUpMoves.filter((m: Raw) => validMove(m.id)).map((m: Raw) => [m.lv, m.id]),
    tm: s.TMHMMoves.filter(validMove),
    tutor: s.tutor.filter(validMove),
    egg: s.eggMoves.filter(validMove),
    forms: s.forms,
  }));
  species.forEach((s, i) => {
    for (const e of s.evos) if (species[e.into] && species[e.into].prevo === null) species[e.into].prevo = i;
  });

  // --- Areas -------------------------------------------------------------
  const areaList: Area[] = [];
  const patterns: { pattern: string; area: Area }[] = [];
  for (const g of AREA_ORDER) {
    for (const a of g.areas) {
      const area: Area = { key: slugify(a.name), name: a.name, group: g.group, maps: [], methods: [], statics: [] };
      areaList.push(area);
      for (const p of a.match ?? [a.name]) patterns.push({ pattern: p, area });
    }
  }
  const unsorted = new Map<string, Area>();
  const matches = (name: string, p: string) => name === p || name.startsWith(p + " ");
  function areaFor(mapName: string): Area | null {
    if (IGNORED_MAPS.some((p) => matches(mapName, p))) return null;
    let best: { pattern: string; area: Area } | null = null;
    for (const c of patterns) {
      if (matches(mapName, c.pattern) && (!best || c.pattern.length > best.pattern.length)) best = c;
    }
    if (best) return best.area;
    if (!unsorted.has(mapName)) {
      unsorted.set(mapName, { key: slugify(mapName), name: mapName, group: "Unsorted", maps: [], methods: [], statics: [] });
    }
    return unsorted.get(mapName)!;
  }

  const L = raw.locations;
  const [oldMax, goodMax] = L.rodGrade; // fish slots 0..oldMax old rod, ..goodMax good rod, rest super rod
  const slotsByArea = new Map<Area, Map<EncounterMethod, EncounterSlot[]>>();
  function addSlots(area: Area, method: EncounterMethod, table: number[][], rates: number[], from = 0, to = table.length - 1) {
    if (!slotsByArea.has(area)) slotsByArea.set(area, new Map());
    const byMethod = slotsByArea.get(area)!;
    if (!byMethod.has(method)) byMethod.set(method, []);
    const list = byMethod.get(method)!;
    for (let i = from; i <= to && i < table.length; i++) {
      const [min, max, spc] = table[i];
      if (spc <= 0) continue;
      list.push({ spc, min, max, rate: rates[i] ?? 0 });
    }
  }
  for (const m of L.maps) {
    const mapName = mapsT[m.id];
    const area = areaFor(mapName);
    if (!area) continue;
    if (!area.maps.includes(mapName)) area.maps.push(mapName);
    if (m.land) addSlots(area, "land", m.land, L.landRate);
    if (m.water) addSlots(area, "surf", m.water, L.waterRate);
    if (m.fish) {
      addSlots(area, "oldRod", m.fish, L.fishRate, 0, oldMax);
      addSlots(area, "goodRod", m.fish, L.fishRate, oldMax + 1, goodMax);
      addSlots(area, "superRod", m.fish, L.fishRate, goodMax + 1);
    }
    if (m.rock) addSlots(area, "rockSmash", m.rock, L.rockRate);
    if (m.honey) addSlots(area, "honey", m.honey, L.honeyRate);
    // Hidden tables with hiddenR -1 are unused (they hold legendary trios).
    if (m.hidden && m.hiddenR > 0) addSlots(area, "hidden", m.hidden, L.hiddenRate);
  }

  const METHOD_ORDER: EncounterMethod[] = ["land", "surf", "oldRod", "goodRod", "superRod", "rockSmash", "honey", "hidden"];
  for (const [area, byMethod] of slotsByArea) {
    for (const method of METHOD_ORDER) {
      const list = byMethod.get(method);
      if (!list?.length) continue;
      // Merge slots of the same species: sum rates, widen level range. Rates are per map, so an
      // area made of several maps can total more than 100; normalize to the area.
      const merged = new Map<number, EncounterSlot>();
      for (const s of list) {
        const m = merged.get(s.spc);
        if (m) {
          m.rate += s.rate;
          m.min = Math.min(m.min, s.min);
          m.max = Math.max(m.max, s.max);
        } else merged.set(s.spc, { ...s });
      }
      const total = [...merged.values()].reduce((n, s) => n + s.rate, 0) || 1;
      const slots = [...merged.values()]
        .map((s) => ({ ...s, rate: Math.round((s.rate * 1000) / total) / 10 }))
        .sort((a, b) => b.rate - a.rate);
      area.methods.push({ method, slots });
    }
  }

  // Static and gift encounters, one entry per species per area.
  raw.species.forEach((s: Raw, spc: number) => {
    for (const e of s.SEnc) {
      const mapName = mapsT[e.map];
      const area = areaFor(mapName);
      if (!area) continue;
      if (!area.maps.includes(mapName)) area.maps.push(mapName);
      const how = raw.scriptedEncoutersHowT[e.how];
      const existing = area.statics.find((x) => x.spc === spc);
      if (existing) {
        if (!existing.how.includes(how)) existing.how.push(how);
      } else area.statics.push({ spc, how: [how], map: mapName });
    }
  });

  const areas = [...areaList, ...unsorted.values()].filter((a) => a.methods.length || a.statics.length);
  if (unsorted.size) console.log(`  Unsorted maps (add them to config/areas.ts): ${[...unsorted.keys()].join(", ")}`);
  const empty = areaList.filter((a) => !a.methods.length && !a.statics.length).map((a) => a.name);
  if (empty.length) console.log(`  Areas with no encounters in this version: ${empty.join(", ")}`);

  return {
    version: version.id,
    label: version.label,
    sourceDate: new Date(raw.creationDate).toISOString(),
    types: raw.typeT,
    abilities,
    moves,
    species,
    areas,
  };
}

mkdirSync(OUT, { recursive: true });
for (const v of VERSIONS) {
  console.log(`Building ${v.id}`);
  const data = build(await load(v.file), v);
  const json = JSON.stringify(data);
  writeFileSync(`${OUT}/${v.id}.json`, json);
  console.log(
    `  ${data.species.length} species, ${data.abilities.length} abilities, ${data.moves.length} moves, ` +
      `${data.areas.length} areas, ${(json.length / 1e6).toFixed(2)} MB`,
  );
}
writeFileSync(`${OUT}/versions.json`, JSON.stringify(VERSIONS.map(({ id, label }) => ({ id, label }))));
