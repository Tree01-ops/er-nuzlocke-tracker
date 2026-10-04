// Sound settings, remembered per browser. Framework-free; the UI reads them via useAudioSettings.

export type AudioSettings = { music: boolean; cries: boolean; volume: number };

const KEY = "er-nuzlocke.audio";
const DEFAULTS: AudioSettings = { music: false, cries: true, volume: 0.6 };

function read(): AudioSettings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return DEFAULTS;
  }
}

let settings = read();
const listeners = new Set<() => void>();

export const audioSettings = {
  get: () => settings,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  set(patch: Partial<AudioSettings>) {
    settings = { ...settings, ...patch };
    try {
      localStorage.setItem(KEY, JSON.stringify(settings));
    } catch {
      /* not remembered; still applies for this visit */
    }
    listeners.forEach((l) => l());
  },
};
