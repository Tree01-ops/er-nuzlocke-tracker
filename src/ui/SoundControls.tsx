import { useEffect, useSyncExternalStore } from "react";
import { startMusic, stopMusic } from "../audio/music.ts";
import { audioSettings } from "../audio/settings.ts";

export function useAudioSettings() {
  return useSyncExternalStore(audioSettings.subscribe, audioSettings.get);
}

/** Music and cry toggles plus volume, for the top bar. */
export function SoundControls() {
  const s = useAudioSettings();

  // Browsers block sound until the user interacts, so saved "music on" starts on the first click or key.
  useEffect(() => {
    if (!audioSettings.get().music) return;
    const start = () => audioSettings.get().music && startMusic();
    window.addEventListener("pointerdown", start, { once: true });
    window.addEventListener("keydown", start, { once: true });
    return () => {
      window.removeEventListener("pointerdown", start);
      window.removeEventListener("keydown", start);
    };
  }, []);

  return (
    <div className="sound-controls">
      <button
        className={`toggle${s.music ? " on" : ""}`}
        aria-pressed={s.music}
        title="Pokémon Center music"
        onClick={() => {
          audioSettings.set({ music: !s.music });
          if (s.music) stopMusic();
          else startMusic();
        }}
      >
        ♪ Music {s.music ? "on" : "off"}
      </button>
      <button
        className={`toggle${s.cries ? " on" : ""}`}
        aria-pressed={s.cries}
        title="Play a Pokémon's cry when you open its page"
        onClick={() => audioSettings.set({ cries: !s.cries })}
      >
        Cries {s.cries ? "on" : "off"}
      </button>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={s.volume}
        aria-label="Volume"
        title={`Volume ${Math.round(s.volume * 100)}%`}
        onChange={(e) => audioSettings.set({ volume: Number(e.target.value) })}
      />
    </div>
  );
}
