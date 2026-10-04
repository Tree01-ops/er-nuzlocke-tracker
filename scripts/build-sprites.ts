// Downloads Pokémon sprites from the Elite Redux source and writes public/sprites/.
//
//   npm run sprites           download what is missing (cached in .cache/sprites)
//   npm run sprites:refresh   re-download everything
//
// For each species key in public/data/*.json it finds a folder under graphics/pokemon/ by name
// (SPECIES_CHARIZARD_MEGA_X -> charizard/mega_x). Each folder has front.png (64x64) or only
// anim_front.png (64x128, two frames; the top one is the still pose), plus icon.png (32x64, two
// frames). Forms without their own folder fall back to the base form's sprite, marked `base`.
//
// The PNGs are 4-bit paletted; GBA treats palette colour 0 as transparent, so a tRNS chunk is
// added to make it transparent on the web. No pixels are decoded.

import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { crc32 } from "node:zlib";
import { SPRITE_ALIASES } from "../config/sprites.ts";
import type { SpriteEntry } from "../src/data/types.ts";
import { allSpeciesKeys, erDownload, erTree, pool } from "./er-source.ts";

const CACHE = ".cache/sprites";
const OUT = "public/sprites";
const refresh = process.argv.includes("--refresh");

/** Every way to split tokens into folder names: [a,b,c] -> a/b/c, a/b_c, a_b/c, a_b_c. */
function folderings(tokens: string[]): string[] {
  if (tokens.length <= 1) return tokens.length ? [tokens[0]] : [];
  const out: string[] = [];
  for (let k = tokens.length; k >= 1; k--) {
    const head = tokens.slice(0, k).join("_");
    const rest = tokens.slice(k);
    if (!rest.length) out.push(head);
    else for (const tail of folderings(rest)) out.push(`${head}/${tail}`);
  }
  return out;
}

function findFolder(files: Set<string>, key: string): { folder: string; base: boolean } | null {
  const has = (f: string) =>
    files.has(`graphics/pokemon/${f}/front.png`) || files.has(`graphics/pokemon/${f}/anim_front.png`);
  const alias = SPRITE_ALIASES[key];
  if (alias && has(alias)) return { folder: alias, base: false };
  const tokens = key.replace(/^SPECIES_/, "").toLowerCase().split("_");
  for (const f of folderings(tokens)) if (has(f)) return { folder: f, base: false };
  // Fall back to the longest prefix that has a sprite (the base form).
  for (let k = tokens.length - 1; k >= 1; k--) {
    for (const f of folderings(tokens.slice(0, k))) if (has(f)) return { folder: f, base: true };
  }
  return null;
}

/**
 * Makes palette index 0 (and only it) transparent, as on the GBA. Some source PNGs carry their own
 * tRNS chunk marking a different index (e.g. Wartortle's marks index 10, leaving the green
 * background opaque), so any existing tRNS is replaced rather than kept.
 */
function makeIndexZeroTransparent(png: Buffer): Buffer {
  if (png[25] !== 3) return png; // not paletted
  const chunks: Buffer[] = [png.subarray(0, 8)];
  let i = 8;
  while (i < png.length) {
    const len = png.readUInt32BE(i);
    const type = png.toString("ascii", i + 4, i + 8);
    const end = i + 12 + len;
    if (type !== "tRNS") chunks.push(png.subarray(i, end));
    if (type === "PLTE") {
      const body = Buffer.concat([Buffer.from("tRNS"), Buffer.from([0])]);
      const chunk = Buffer.alloc(12 + 1);
      chunk.writeUInt32BE(1, 0);
      body.copy(chunk, 4);
      chunk.writeUInt32BE(crc32(body) >>> 0, 9);
      chunks.push(chunk);
    }
    i = end;
  }
  return Buffer.concat(chunks);
}

const files = new Set([...(await erTree(refresh))].filter((p) => p.startsWith("graphics/pokemon/")));
const download = (path: string) => erDownload(path, CACHE, refresh);
mkdirSync(OUT, { recursive: true });

const keys = allSpeciesKeys(readdirSync);

const manifest: Record<string, SpriteEntry> = {};
const missing: string[] = [];
let done = 0;
await pool(keys, 12, async (key) => {
  const found = findFolder(files, key);
  if (!found) {
    missing.push(key);
    return;
  }
  const dir = `graphics/pokemon/${found.folder}`;
  const anim = !files.has(`${dir}/front.png`);
  const front = await download(`${dir}/${anim ? "anim_front" : "front"}.png`);
  if (!front) {
    missing.push(key);
    return;
  }
  const name = key.replace(/^SPECIES_/, "");
  writeFileSync(`${OUT}/${name}.png`, makeIndexZeroTransparent(front));
  const entry: SpriteEntry = {};
  if (anim) entry.anim = true;
  if (found.base) entry.base = true;
  const icon = files.has(`${dir}/icon.png`) ? await download(`${dir}/icon.png`) : null;
  if (icon) {
    writeFileSync(`${OUT}/${name}.icon.png`, makeIndexZeroTransparent(icon));
    entry.icon = true;
  }
  manifest[key] = entry;
  if (++done % 200 === 0) console.log(`  ${done} sprites…`);
});

const sorted = Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(`${OUT}/index.json`, JSON.stringify(sorted));
const base = Object.values(manifest).filter((e) => e.base).length;
console.log(`${Object.keys(manifest).length} of ${keys.length} species have sprites (${base} use their base form's).`);
if (missing.length) console.log(`No sprite: ${missing.sort().join(", ")}`);
