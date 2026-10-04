// Plays a species' cry (public/sounds/cries). A new cry cuts off the previous one, so browsing
// quickly with the arrow keys doesn't pile them up.

import { audio, canPlay, loadBuffer } from "./engine.ts";
import { audioSettings } from "./settings.ts";

const base = import.meta.env.BASE_URL;
let index: Promise<Record<string, string>> | null = null;
let current: AudioBufferSourceNode | null = null;
let request = 0;

function cryIndex() {
  index ??= fetch(`${base}sounds/cries/index.json`)
    .then((res) => (res.ok ? res.json() : {}))
    .catch(() => ({}));
  return index;
}

export async function playCry(speciesKey: string) {
  if (!audioSettings.get().cries || !canPlay()) return;
  const mine = ++request;
  const name = (await cryIndex())[speciesKey];
  if (!name) return;
  const buffer = await loadBuffer(`${base}sounds/cries/${name}.wav`);
  if (!buffer || mine !== request) return; // a newer cry was asked for meanwhile
  const { ctx, master } = audio();
  if (ctx.state === "suspended") await ctx.resume();
  current?.stop();
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const gain = ctx.createGain();
  gain.gain.value = 0.65;
  source.connect(gain).connect(master);
  source.start();
  current = source;
  source.onended = () => {
    if (current === source) current = null;
  };
}
