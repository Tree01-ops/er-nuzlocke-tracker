// Plays the Pokémon Center theme like the GBA does: the game's MIDI file driven through its own
// instruments (square waves, the 4-bit wave channel, noise, and recorded samples), exported by
// scripts/build-sounds.ts. Intro once, then the "[" .. "]" section loops forever.
//
// Envelopes follow the GBA sound engine (m4a): sample instruments step their volume once per
// frame (60 Hz) by attack/decay/release factors out of 256; the square/wave/noise channels use
// small 0-7 step counts, approximated here with short time constants.

import { audio, loadBuffer } from "./engine.ts";
import type { Note, Song } from "./midi.ts";
import { parseMidi } from "./midi.ts";

type Env = { a: number; d: number; s: number; r: number };
type Instrument =
  | { kind: "square"; duty: number; env: Env }
  | { kind: "wave"; wave: number[]; env: Env }
  | { kind: "noise"; env: Env }
  | { kind: "sample"; sample: string; env: Env }
  | { kind: "split"; ranges: { from: number; to: number; inst: Instrument }[] };
type SampleInfo = { rate: number; loopStart: number | null; loopEnd: number | null };
type SongFile = { midi: string; volume: number; instruments: Record<string, Instrument>; samples: Record<string, SampleInfo> };

const DIR = `${import.meta.env.BASE_URL}sounds/music/`;
const SONG = "mus_poke_center";
const LOOKAHEAD = 0.3; // seconds of notes scheduled ahead
const TICK_MS = 60;

/** Relative loudness of each channel type, like the GBA mix (8-bit samples vs. square chips). */
const LEVEL = { square: 0.3, wave: 0.4, noise: 0.22, sample: 0.9 };

type Loaded = {
  song: Song;
  file: SongFile;
  buffers: Map<string, AudioBuffer>;
  pulses: PeriodicWave[];
  waves: Map<Instrument, PeriodicWave>;
  noise: AudioBuffer;
};

let loading: Promise<Loaded> | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let bus: GainNode | null = null;
let playing = false;

async function load(): Promise<Loaded> {
  const { ctx } = audio();
  const file: SongFile = await (await fetch(`${DIR}${SONG}.json`)).json();
  const song = parseMidi(new Uint8Array(await (await fetch(DIR + file.midi)).arrayBuffer()));

  const buffers = new Map<string, AudioBuffer>();
  await Promise.all(
    Object.keys(file.samples).map(async (name) => {
      const b = await loadBuffer(`${DIR}${name}.wav`);
      if (b) buffers.set(name, b);
    }),
  );

  // Square waves with the GBA's four duty cycles (12.5, 25, 50, 75 %).
  const pulses = [0.125, 0.25, 0.5, 0.75].map((duty) => {
    const n = 64;
    const real = new Float32Array(n);
    const imag = new Float32Array(n);
    for (let k = 1; k < n; k++) real[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
    return ctx.createPeriodicWave(real, imag);
  });

  // The 4-bit, 32-step wave channel shapes, turned into periodic waves.
  const waves = new Map<Instrument, PeriodicWave>();
  const addWaves = (inst: Instrument) => {
    if (inst.kind === "split") inst.ranges.forEach((r) => addWaves(r.inst));
    if (inst.kind !== "wave") return;
    const values = inst.wave.map((v) => (v - 7.5) / 7.5);
    const n = 16;
    const real = new Float32Array(n);
    const imag = new Float32Array(n);
    for (let k = 1; k < n; k++) {
      values.forEach((v, j) => {
        const angle = (2 * Math.PI * k * j) / values.length;
        real[k] += (v * Math.cos(angle)) / values.length;
        imag[k] += (v * Math.sin(angle)) / values.length;
      });
    }
    waves.set(inst, ctx.createPeriodicWave(real, imag));
  };
  Object.values(file.instruments).forEach(addWaves);

  // GBA-style noise: random levels held for a few samples, pitched by playback rate.
  const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0, v = 0; i < data.length; i++) {
    if (i % 4 === 0) v = Math.random() < 0.5 ? -1 : 1;
    data[i] = v;
  }

  return { song, file, buffers, pulses, waves, noise };
}

const hz = (key: number) => 440 * 2 ** ((key - 69) / 12);
/** m4a sample envelopes multiply the level by x/256 each frame; as a time constant: */
const frameTau = (x: number) => (x <= 0 ? 0.001 : x >= 256 ? 1e6 : -1 / (60 * Math.log(x / 256)));

function pick(inst: Instrument | undefined, key: number): Instrument | undefined {
  if (inst?.kind !== "split") return inst;
  return inst.ranges.find((r) => key >= r.from && key <= r.to)?.inst ?? inst.ranges[inst.ranges.length - 1]?.inst;
}

function playNote(l: Loaded, note: Note, when: number, out: AudioNode) {
  const { ctx } = audio();
  const inst = pick(l.file.instruments[note.program], note.key);
  if (!inst || inst.kind === "split" || note.dur <= 0) return;

  let source: AudioScheduledSourceNode;
  const key = note.key + note.bend;
  if (inst.kind === "square" || inst.kind === "wave") {
    const osc = ctx.createOscillator();
    osc.setPeriodicWave(inst.kind === "square" ? l.pulses[inst.duty & 3] : l.waves.get(inst)!);
    osc.frequency.value = hz(key);
    source = osc;
  } else {
    const buf = inst.kind === "noise" ? l.noise : l.buffers.get(inst.sample);
    if (!buf) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    if (inst.kind === "noise") {
      src.loop = true;
      src.playbackRate.value = Math.min(4, 2 ** ((note.key - 72) / 12));
    } else {
      const info = l.file.samples[inst.sample];
      src.playbackRate.value = (info.rate / buf.sampleRate) * 2 ** ((key - 60) / 12);
      if (info.loopStart !== null && info.loopEnd !== null && info.loopEnd > info.loopStart) {
        src.loop = true;
        src.loopStart = info.loopStart / buf.sampleRate;
        src.loopEnd = info.loopEnd / buf.sampleRate;
      }
    }
    source = src;
  }

  const peak = LEVEL[inst.kind] * (note.vel / 127) * (note.volume / 127);
  const gain = ctx.createGain();
  const g = gain.gain;
  const off = when + note.dur;
  const e = inst.env;
  const sampled = inst.kind === "sample";
  // Attack ramp, then decay toward the sustain level, then release from note-off.
  const attack = Math.min(note.dur * 0.5, sampled ? (e.a >= 255 ? 0.003 : 255 / Math.max(1, e.a) / 60) : 0.004 + e.a * 0.05);
  const sustain = sampled ? (e.s >= 255 ? peak : (peak * e.s) / 255) : (peak * e.s) / 15;
  const decayTau = sampled ? frameTau(e.d) : e.d ? e.d * 0.04 : 0.001;
  const releaseTau = sampled ? frameTau(e.r) : e.r ? e.r * 0.04 : 0.008;
  g.setValueAtTime(0, when);
  g.linearRampToValueAtTime(peak, when + attack);
  g.setTargetAtTime(sustain, when + attack, decayTau);
  // Level at note-off, worked out here instead of cancelAndHoldAtTime (missing in Firefox).
  const level = sustain + (peak - sustain) * Math.exp(-(off - when - attack) / decayTau);
  g.setValueAtTime(level, off);
  g.setTargetAtTime(0, off, releaseTau);

  const pan = ctx.createStereoPanner();
  pan.pan.value = Math.max(-1, Math.min(1, (note.pan - 64) / 64));
  source.connect(gain).connect(pan).connect(out);
  source.start(when);
  source.stop(off + releaseTau * 6 + 0.02);
}

export async function startMusic() {
  if (playing) return;
  playing = true;
  loading ??= load();
  let l: Loaded;
  try {
    l = await loading;
  } catch {
    loading = null;
    playing = false;
    return;
  }
  if (!playing) return; // stopped while loading
  const { ctx, master } = audio();
  if (ctx.state === "suspended") await ctx.resume();

  bus = ctx.createGain();
  bus.gain.value = l.file.volume / 127;
  bus.connect(master);
  const out = bus;

  // Walk the timeline: the whole song once, then only the loop section, again and again.
  const { notes, loopStart, loopEnd } = l.song;
  const loopFrom = notes.findIndex((n) => n.t >= loopStart);
  let cursor = 0;
  let offset = ctx.currentTime + 0.1;
  const tick = () => {
    const horizon = ctx.currentTime + LOOKAHEAD;
    for (;;) {
      if (cursor >= notes.length || notes[cursor].t >= loopEnd) {
        if (loopFrom < 0) return;
        cursor = loopFrom;
        offset += loopEnd - loopStart;
      }
      const note = notes[cursor];
      const when = offset + note.t;
      if (when > horizon) return;
      if (when >= ctx.currentTime) playNote(l, note, when, out);
      cursor++;
    }
  };
  tick();
  timer = setInterval(tick, TICK_MS);
}

export function stopMusic() {
  playing = false;
  if (timer) clearInterval(timer);
  timer = null;
  if (bus) {
    const { ctx } = audio();
    const old = bus;
    old.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
    setTimeout(() => old.disconnect(), 600);
    bus = null;
  }
}
