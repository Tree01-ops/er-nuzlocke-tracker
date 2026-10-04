// One shared AudioContext with a master volume. Browsers only allow sound after the user has
// interacted with the page, so nothing plays until then.

import { audioSettings } from "./settings.ts";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

export function audio(): { ctx: AudioContext; master: GainNode } {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = audioSettings.get().volume;
    master.connect(ctx.destination);
    audioSettings.subscribe(() => master!.gain.setTargetAtTime(audioSettings.get().volume, ctx!.currentTime, 0.05));
  }
  return { ctx, master: master! };
}

/** True once the user has clicked or typed on the page, so sound is allowed. */
export function canPlay(): boolean {
  const activation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
  return activation ? activation.hasBeenActive : true;
}

const buffers = new Map<string, Promise<AudioBuffer | null>>();

/** Fetches and decodes a sound file once. Null if it can't be loaded. */
export function loadBuffer(url: string): Promise<AudioBuffer | null> {
  if (!buffers.has(url)) {
    buffers.set(
      url,
      fetch(url)
        .then((res) => (res.ok ? res.arrayBuffer() : Promise.reject(res.status)))
        .then((data) => audio().ctx.decodeAudioData(data))
        .catch(() => null),
    );
  }
  return buffers.get(url)!;
}
