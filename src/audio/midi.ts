// Minimal Standard MIDI File reader: turns a song into a flat list of notes with times in seconds.
// GBA songs (mid2agb) mark their loop with text markers "[" (loop start) and "]" (loop end).

export type Note = {
  /** Start and length in seconds. */
  t: number;
  dur: number;
  ch: number;
  key: number;
  vel: number;
  /** Channel state when the note starts. */
  program: number;
  volume: number;
  pan: number;
  /** Pitch bend in semitones at note start. */
  bend: number;
};

export type Song = { notes: Note[]; loopStart: number; loopEnd: number };

type Event = { tick: number; order: number; kind: "on" | "off" | "program" | "cc" | "bend" | "tempo" | "marker"; ch: number; a: number; b: number; text?: string };

export function parseMidi(bytes: Uint8Array): Song {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const str = (i: number, n: number) => String.fromCharCode(...bytes.subarray(i, i + n));
  if (str(0, 4) !== "MThd") throw new Error("Not a MIDI file");
  const tracks = view.getUint16(10);
  const division = view.getUint16(12);
  if (division & 0x8000) throw new Error("SMPTE timing isn't supported");

  const events: Event[] = [];
  let pos = 8 + view.getUint32(4);
  let order = 0;
  for (let t = 0; t < tracks; t++) {
    if (str(pos, 4) !== "MTrk") throw new Error("Bad track");
    const end = pos + 8 + view.getUint32(pos + 4);
    let i = pos + 8;
    let tick = 0;
    let status = 0;
    const vlq = () => {
      let v = 0;
      for (;;) {
        const c = bytes[i++];
        v = (v << 7) | (c & 0x7f);
        if (c < 0x80) return v;
      }
    };
    while (i < end) {
      tick += vlq();
      if (bytes[i] & 0x80) status = bytes[i++];
      if (status === 0xff) {
        const type = bytes[i++];
        const len = vlq();
        if (type === 0x51) events.push({ tick, order: order++, kind: "tempo", ch: 0, a: (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2], b: 0 });
        if (type === 0x06) events.push({ tick, order: order++, kind: "marker", ch: 0, a: 0, b: 0, text: str(i, len) });
        i += len;
        continue;
      }
      if (status === 0xf0 || status === 0xf7) {
        i += vlq();
        continue;
      }
      const kind = status & 0xf0;
      const ch = status & 0x0f;
      if (kind === 0xc0 || kind === 0xd0) {
        if (kind === 0xc0) events.push({ tick, order: order++, kind: "program", ch, a: bytes[i], b: 0 });
        i += 1;
        continue;
      }
      const a = bytes[i];
      const b = bytes[i + 1];
      i += 2;
      if (kind === 0x90 && b > 0) events.push({ tick, order: order++, kind: "on", ch, a, b });
      else if (kind === 0x80 || kind === 0x90) events.push({ tick, order: order++, kind: "off", ch, a, b });
      else if (kind === 0xb0) events.push({ tick, order: order++, kind: "cc", ch, a, b });
      else if (kind === 0xe0) events.push({ tick, order: order++, kind: "bend", ch, a: ((b << 7) | a) - 8192, b: 0 });
    }
    pos = end;
  }
  // Note-offs before note-ons at the same tick, so repeated notes don't cut themselves off.
  events.sort((x, y) => x.tick - y.tick || Number(x.kind !== "off") - Number(y.kind !== "off") || x.order - y.order);

  // Ticks -> seconds through the tempo map.
  let tempo = 500000;
  let lastTick = 0;
  let lastSec = 0;
  const seconds = (tick: number) => lastSec + ((tick - lastTick) * tempo) / division / 1e6;

  const state = Array.from({ length: 16 }, () => ({ program: 0, volume: 100, pan: 64, bend: 0, bendRange: 2 }));
  const open = new Map<string, Note>();
  const notes: Note[] = [];
  let loopStart = 0;
  let loopEnd = -1;
  let endSec = 0;
  for (const e of events) {
    const sec = seconds(e.tick);
    endSec = Math.max(endSec, sec);
    const s = state[e.ch];
    switch (e.kind) {
      case "tempo":
        lastSec = sec;
        lastTick = e.tick;
        tempo = e.a;
        break;
      case "marker":
        if (e.text === "[") loopStart = sec;
        if (e.text === "]") loopEnd = sec;
        break;
      case "program":
        s.program = e.a;
        break;
      case "cc":
        if (e.a === 7) s.volume = e.b;
        if (e.a === 10) s.pan = e.b;
        if (e.a === 20) s.bendRange = e.b; // GBA "bend range" controller
        break;
      case "bend":
        s.bend = (e.a / 8192) * s.bendRange;
        break;
      case "on": {
        const id = `${e.ch}:${e.a}`;
        const prev = open.get(id);
        if (prev) prev.dur = sec - prev.t;
        const note = { t: sec, dur: 0, ch: e.ch, key: e.a, vel: e.b, program: s.program, volume: s.volume, pan: s.pan, bend: s.bend };
        open.set(id, note);
        notes.push(note);
        break;
      }
      case "off": {
        const id = `${e.ch}:${e.a}`;
        const note = open.get(id);
        if (note) {
          note.dur = sec - note.t;
          open.delete(id);
        }
        break;
      }
    }
  }
  for (const note of open.values()) note.dur = Math.max(0.05, endSec - note.t);
  return { notes, loopStart, loopEnd: loopEnd > loopStart ? loopEnd : endSec };
}
