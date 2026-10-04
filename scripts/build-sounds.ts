// Downloads cries and the Pokémon Center music from the Elite Redux source into public/sounds/.
//
//   npm run sounds            download what is missing (cached in .cache/sounds)
//   npm run sounds:refresh    re-download everything
//
// Cries are 8-bit mono AIFF files (sound/direct_sound_samples/cries/<name>.aif). Browsers other
// than Safari can't play AIFF, so each is rewritten as a WAV here; the samples are untouched.
// Species are matched to cries by name (SPECIES_CHARIZARD_MEGA_X -> charizard); a species with
// no cry of its own uses the one of the species it evolves from.
//
// Music: the game's MIDI file plus the instruments the GBA plays it with. songs.mk names the
// song's voicegroup (its instrument list); each instrument is a GBA square/wave/noise channel or a
// recorded sample. Those are exported to public/sounds/music/ for the in-app synth (src/audio).

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { allSpeciesKeys, erDownload, erTree, pool } from "./er-source.ts";

const CACHE = ".cache/sounds";
const OUT = "public/sounds";
const CRIES = "sound/direct_sound_samples/cries/";
const SONG = "mus_poke_center";
const refresh = process.argv.includes("--refresh");

type Aiff = { rate: number; channels: number; samples: Buffer; loopStart: number | null; loopEnd: number | null; baseNote: number };

/** Reads an 8-bit AIFF: sample rate, signed samples, and the sustain loop (MARK + INST) if any. */
function readAiff(aiff: Buffer): Aiff {
  if (aiff.toString("ascii", 0, 4) !== "FORM" || aiff.toString("ascii", 8, 12) !== "AIFF") throw new Error("not AIFF");
  let channels = 1;
  let bits = 8;
  let rate = 0;
  let samples: Buffer | null = null;
  const marks = new Map<number, number>();
  let loop: [number, number] | null = null;
  let baseNote = 60;
  for (let i = 12; i + 8 <= aiff.length; ) {
    const id = aiff.toString("ascii", i, i + 4);
    const size = aiff.readUInt32BE(i + 4);
    const body = aiff.subarray(i + 8, i + 8 + size);
    if (id === "COMM") {
      channels = body.readUInt16BE(0);
      bits = body.readUInt16BE(6);
      // 80-bit IEEE extended float
      const exponent = (body.readUInt16BE(8) & 0x7fff) - 16383;
      const mantissa = body.readUInt32BE(10);
      rate = Math.round(mantissa * 2 ** (exponent - 31));
    } else if (id === "SSND") {
      const offset = body.readUInt32BE(0);
      samples = body.subarray(8 + offset);
    } else if (id === "MARK") {
      let j = 2;
      for (let m = body.readUInt16BE(0); m > 0; m--) {
        const len = body[j + 6];
        marks.set(body.readInt16BE(j), body.readUInt32BE(j + 2));
        j += 7 + len + ((len + 1) % 2);
      }
    } else if (id === "INST") {
      baseNote = body.readInt8(0);
      if (body.readInt16BE(8) !== 0) loop = [body.readInt16BE(10), body.readInt16BE(12)]; // sustain loop marker ids
    }
    i += 8 + size + (size & 1);
  }
  if (!samples || bits !== 8 || !rate) throw new Error(`unsupported AIFF (${bits}-bit, ${rate} Hz)`);
  const loopStart = loop ? (marks.get(loop[0]) ?? null) : null;
  const loopEnd = loop ? (marks.get(loop[1]) ?? null) : null;
  return { rate, channels, samples, loopStart, loopEnd, baseNote };
}

/** 8-bit signed big-endian AIFF -> 8-bit unsigned WAV. */
function aiffToWav(aiff: Buffer): Buffer {
  return toWav(readAiff(aiff));
}

function toWav({ rate, channels, samples }: Aiff): Buffer {
  const pcm = Buffer.from(samples.map((b) => (b + 128) & 0xff)); // signed -> unsigned
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * channels, 28);
  header.writeUInt16LE(channels, 32);
  header.writeUInt16LE(8, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

const files = await erTree(refresh);
// Cry name -> file name. Newer cries are stored as "uncomp_<name>.aif".
const cryFiles = new Map<string, string>();
for (const p of files) {
  if (!p.startsWith(CRIES) || !p.endsWith(".aif")) continue;
  const file = p.slice(CRIES.length, -4);
  const name = file.replace(/^uncomp_/, "");
  if (!cryFiles.has(name) || file === name) cryFiles.set(name, file);
}
const cryNames = new Set(cryFiles.keys());
mkdirSync(`${OUT}/cries`, { recursive: true });

// Evolution parents, for species without a cry of their own.
const prevo = new Map<string, string>();
for (const f of readdirSync("public/data")) {
  if (f === "versions.json" || !f.endsWith(".json")) continue;
  const data = JSON.parse(readFileSync(`public/data/${f}`, "utf8")) as { species: { key: string; prevo: number | null }[] };
  data.species.forEach((s) => {
    if (s.prevo !== null && !prevo.has(s.key)) prevo.set(s.key, data.species[s.prevo].key);
  });
}

function ownCry(key: string): string | null {
  const tokens = key.replace(/^SPECIES_/, "").toLowerCase().split("_");
  for (let k = tokens.length; k >= 1; k--) {
    const name = tokens.slice(0, k).join("_");
    if (cryNames.has(name)) return name;
    const joined = tokens.slice(0, k).join("");
    if (cryNames.has(joined)) return joined; // mr_mime -> mrmime style names
  }
  return null;
}

const index: Record<string, string> = {};
const borrowed: string[] = [];
const missing: string[] = [];
for (const key of allSpeciesKeys(readdirSync)) {
  let cry = ownCry(key);
  const seen = new Set<string>();
  for (let k = key; !cry && prevo.has(k) && !seen.has(k); k = prevo.get(k)!) {
    seen.add(k);
    cry = ownCry(prevo.get(k)!);
    if (cry) borrowed.push(key);
  }
  if (cry) index[key] = cry;
  else missing.push(key);
}

const needed = [...new Set(Object.values(index))];
let failed = 0;
await pool(needed, 12, async (name) => {
  const aiff = await erDownload(`${CRIES}${cryFiles.get(name)}.aif`, CACHE, refresh);
  try {
    if (!aiff) throw new Error("download failed");
    writeFileSync(`${OUT}/cries/${name}.wav`, aiffToWav(aiff));
  } catch (e) {
    failed++;
    console.log(`  ${name}: ${(e as Error).message}`);
    for (const [k, v] of Object.entries(index)) if (v === name) delete index[k];
  }
});
writeFileSync(`${OUT}/cries/index.json`, JSON.stringify(index));

await buildMusic();

console.log(
  `${Object.keys(index).length} species have a cry (${borrowed.length} borrow their pre-evolution's), ` +
    `${needed.length - failed} cry files.`,
);
if (missing.length) console.log(`No cry: ${missing.length} species, e.g. ${missing.slice(0, 12).join(", ")}`);

// ---- Music -------------------------------------------------------------------------------

type Env = { a: number; d: number; s: number; r: number };
export type Instrument =
  | { kind: "square"; duty: number; env: Env }
  | { kind: "wave"; wave: number[]; env: Env }
  | { kind: "noise"; env: Env }
  | { kind: "sample"; sample: string; env: Env }
  | { kind: "split"; ranges: { from: number; to: number; inst: Instrument }[] };

async function text(path: string): Promise<string> {
  const buf = await erDownload(path, CACHE, refresh);
  if (!buf) throw new Error(`Couldn't download ${path}`);
  return buf.toString("utf8");
}

/** Program numbers a MIDI file selects (0xC0 events). */
function programsUsed(midi: Buffer): Set<number> {
  const used = new Set<number>();
  for (let i = 0; i + 1 < midi.length; i++) {
    // Cheap scan: program change status byte followed by a data byte. Over-matching is harmless.
    if ((midi[i] & 0xf0) === 0xc0 && midi[i + 1] < 0x80) used.add(midi[i + 1]);
  }
  return used;
}

async function buildMusic() {
  const midi = await erDownload(`sound/songs/midi/${SONG}.mid`, CACHE, refresh);
  if (!midi) throw new Error(`Couldn't download ${SONG}.mid`);

  const rule = (await text("songs.mk")).split(`${SONG}.s:`)[1]?.split("\n").slice(0, 2).join(" ") ?? "";
  const group = rule.match(/-G(\w+)/)?.[1];
  const volume = Number(rule.match(/-V(\d+)/)?.[1] ?? 127);
  if (!group) throw new Error(`No voicegroup for ${SONG} in songs.mk`);

  const directSound = parseLabels(await text("sound/direct_sound_data.inc"));
  const waves = parseLabels(await text("sound/programmable_wave_data.inc"));
  const splitTables = parseKeysplitTables(await text("sound/keysplit_tables.inc"));
  const samples: Record<string, { rate: number; loopStart: number | null; loopEnd: number | null }> = {};
  mkdirSync(`${OUT}/music`, { recursive: true });

  const voicegroup = async (name: string) =>
    (await text(`sound/voicegroups/${name}.inc`)).split("\n").filter((l) => /^\s*voice_/.test(l)).map((l) => l.trim());

  async function instrument(line: string): Promise<Instrument | null> {
    const [macro, rest = ""] = line.split(/\s+(.*)/);
    const a = rest.split(",").map((x) => x.trim());
    const env = (i: number): Env => ({ a: +a[i], d: +a[i + 1], s: +a[i + 2], r: +a[i + 3] });
    if (macro.startsWith("voice_square_1")) return { kind: "square", duty: +a[3], env: env(4) };
    if (macro.startsWith("voice_square_2")) return { kind: "square", duty: +a[2], env: env(3) };
    if (macro.startsWith("voice_noise")) return { kind: "noise", env: env(3) };
    if (macro.startsWith("voice_programmable_wave")) {
      const pcm = await erDownload(waves.get(a[2])!, CACHE, refresh);
      if (!pcm) return null;
      const wave = [...pcm.subarray(0, 16)].flatMap((b) => [b >> 4, b & 15]);
      return { kind: "wave", wave, env: env(3) };
    }
    if (macro.startsWith("voice_directsound")) {
      const bin = directSound.get(a[2]);
      if (!bin) return null;
      const name = bin.split("/").pop()!.replace(/\.bin$/, "");
      if (!samples[name]) {
        const aiff = await erDownload(bin.replace(/\.bin$/, ".aif"), CACHE, refresh);
        if (!aiff) return null;
        const parsed = readAiff(aiff);
        writeFileSync(`${OUT}/music/${name}.wav`, toWav(parsed));
        // Shift the rate so the sample plays at its pitch when the note is 60.
        const rate = parsed.rate * 2 ** ((60 - parsed.baseNote) / 12);
        samples[name] = { rate, loopStart: parsed.loopStart, loopEnd: parsed.loopEnd };
      }
      return { kind: "sample", sample: name, env: env(3) };
    }
    if (macro === "voice_keysplit") {
      const sub = await voicegroup(a[0]);
      const table = splitTables.get(a[1]);
      if (!table) return null;
      const ranges: { from: number; to: number; inst: Instrument }[] = [];
      for (const [note, index] of table) {
        const last = ranges[ranges.length - 1] as (typeof ranges)[number] & { index?: number };
        if (last && last.index === index && last.to === note - 1) {
          last.to = note;
          continue;
        }
        const inst = await instrument(sub[index]);
        if (inst) ranges.push(Object.assign({ from: note, to: note, inst }, { index }));
      }
      return { kind: "split", ranges: ranges.map(({ from, to, inst }) => ({ from, to, inst })) };
    }
    return null;
  }

  const voices = await voicegroup(`voicegroup${group}`);
  const instruments: Record<number, Instrument> = {};
  for (const program of programsUsed(midi)) {
    const inst = voices[program] ? await instrument(voices[program]) : null;
    if (inst) instruments[program] = inst;
  }

  writeFileSync(`${OUT}/music/${SONG}.mid`, midi);
  writeFileSync(`${OUT}/music/${SONG}.json`, JSON.stringify({ midi: `${SONG}.mid`, volume, instruments, samples }));
  console.log(`Music: ${SONG} with ${Object.keys(instruments).length} instruments, ${Object.keys(samples).length} samples.`);
}

/** `Label::` followed by `.incbin "path"` -> Map(label -> path). */
function parseLabels(inc: string): Map<string, string> {
  const map = new Map<string, string>();
  let label = "";
  for (const line of inc.split("\n")) {
    const l = line.match(/^(\w+)::/);
    if (l) label = l[1];
    const p = line.match(/\.incbin\s+"([^"]+)"/);
    if (p && label) map.set(label, p[1]);
  }
  return map;
}

/** keysplit_tables.inc: `.set Table, . - N` then `.byte v` per note from N. -> Map(table -> [note, voice][]). */
function parseKeysplitTables(inc: string): Map<string, [number, number][]> {
  const tables = new Map<string, [number, number][]>();
  let current: [number, number][] | null = null;
  let note = 0;
  for (const line of inc.split("\n")) {
    const set = line.match(/\.set\s+(\w+),\s*\.\s*-\s*(\d+)/);
    if (set) {
      current = [];
      tables.set(set[1], current);
      note = +set[2];
      continue;
    }
    const byte = line.match(/^\s*\.byte\s+(\d+)/);
    if (byte && current) current.push([note++, +byte[1]]);
  }
  return tables;
}
