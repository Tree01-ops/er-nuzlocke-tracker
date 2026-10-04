import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseMidi } from "./midi.ts";

/** Builds a one-track MIDI file from raw track bytes (delta times already included). */
function midi(division: number, track: number[]): Uint8Array {
  const header = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, division >> 8, division & 255];
  const len = track.length;
  return new Uint8Array([...header, 0x4d, 0x54, 0x72, 0x6b, len >> 24, (len >> 16) & 255, (len >> 8) & 255, len & 255, ...track]);
}

describe("MIDI reader", () => {
  it("reads notes with times from the tempo, plus channel state", () => {
    const song = parseMidi(
      midi(24, [
        0x00, 0xff, 0x51, 0x03, 0x07, 0xa1, 0x20, // tempo 500000 us per quarter (120 BPM)
        0x00, 0xc1, 0x05, // channel 1 program 5
        0x00, 0xb1, 0x07, 0x50, // volume 80
        0x00, 0x91, 0x3c, 0x64, // note on C4 vel 100
        0x18, 0x81, 0x3c, 0x00, // 24 ticks later: note off
        0x00, 0xff, 0x2f, 0x00,
      ]),
    );
    expect(song.notes).toEqual([{ t: 0, dur: 0.5, ch: 1, key: 60, vel: 100, program: 5, volume: 80, pan: 64, bend: 0 }]);
  });

  it("finds the GBA loop markers", () => {
    const song = parseMidi(
      midi(24, [
        0x00, 0x90, 0x40, 0x40,
        0x18, 0xff, 0x06, 0x01, 0x5b, // "[" after one beat
        0x00, 0x80, 0x40, 0x00,
        0x30, 0xff, 0x06, 0x01, 0x5d, // "]" two beats later
        0x00, 0xff, 0x2f, 0x00,
      ]),
    );
    expect(song.loopStart).toBe(0.5);
    expect(song.loopEnd).toBe(1.5);
  });

  const file = "public/sounds/music/mus_poke_center.mid";
  it.skipIf(!existsSync(file))("reads the Pokémon Center theme", () => {
    const song = parseMidi(new Uint8Array(readFileSync(file)));
    expect(song.notes.length).toBeGreaterThan(900);
    expect(song.loopEnd).toBeGreaterThan(song.loopStart);
    expect(song.notes.every((n) => n.dur > 0)).toBe(true);
  });
});
