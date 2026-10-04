import type { KeyboardEvent } from "react";
import { useEffect, useLayoutEffect, useRef } from "react";
import type { Dex } from "../data/load.ts";
import { isRealAbility } from "../data/load.ts";
import type { Panel } from "./route.ts";
import { href } from "./route.ts";

const TYPE_COLORS: Record<string, string> = {
  Normal: "#9fa19f", Fighting: "#ff8000", Fire: "#e62829", Ice: "#3dcef3", Electric: "#fac000",
  Bug: "#91a119", Flying: "#81b9ef", Steel: "#60a1b8", Grass: "#3fa129", Ground: "#915121",
  Poison: "#9141cb", Dark: "#624d4e", Water: "#2980ef", Psychic: "#ef4179", Rock: "#afa981",
  Dragon: "#5060e1", Ghost: "#704170", Fairy: "#ef70ef", Stellar: "#40b5a5",
};

export function TypeBadge({ name }: { name: string }) {
  return (
    <span className="type" style={{ background: TYPE_COLORS[name] ?? "#555" }}>
      {name}
    </span>
  );
}

export function Types({ dex, types }: { dex: Dex; types: number[] }) {
  const names = [...new Set(types.map((t) => dex.types[t]))];
  return (
    <span className="types">
      {names.map((n) => (
        <TypeBadge key={n} name={n} />
      ))}
    </span>
  );
}

export function AbilityLink({ dex, index }: { dex: Dex; index: number }) {
  if (!isRealAbility(dex, index)) return <span className="muted">—</span>;
  const a = dex.abilities[index];
  return (
    <a href={href("abilities", a.key)} data-ability={a.key}>
      {a.name}
    </a>
  );
}

export function SpeciesLink({ dex, index }: { dex: Dex; index: number }) {
  const s = dex.species[index];
  if (!s) return <span className="muted">?</span>;
  return <a href={href("species", s.key)}>{s.name}</a>;
}

/** Case-insensitive match of every word in the query. */
export function matchesQuery(text: string, query: string): boolean {
  const t = text.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => t.includes(w));
}

/**
 * The little Poké Ball beside each dex row. `open` is a faint outline (nothing yet),
 * `dead` is grey with a cross.
 */
export function PokeBall({ state }: { state?: "open" | "dead" }) {
  const line = state === "open" ? "#b0b0a8" : "#303030";
  const top = state === "open" ? "#fff" : state ? "#9a9a94" : "#e83030";
  return (
    <svg className={`ball${state ? " " + state : ""}`} viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <circle cx="8" cy="8" r="7" fill="#fff" stroke={line} strokeWidth="1.5" />
      <path d="M1 8a7 7 0 0 1 14 0z" fill={top} stroke={line} strokeWidth="1.5" />
      <circle cx="8" cy="8" r="2.4" fill="#fff" stroke={line} strokeWidth="1.5" />
      {state === "dead" && <path d="M3 3l10 10M13 3L3 13" stroke="#303030" strokeWidth="1.6" />}
    </svg>
  );
}

/**
 * Re-runs a CSS animation class on the returned element whenever `dep` changes, without
 * remounting it (remounting would reset things like the radar's morph).
 */
export function useReplay<T extends HTMLElement>(dep: unknown, className: string) {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.classList.remove(className);
    void el.offsetWidth; // force a reflow so the animation starts over
    el.classList.add(className);
  }, [dep, className]);
  return ref;
}

/** Arrow-key browsing through a list of item keys, like moving the cursor in the dex. */
export function useListKeys(panel: Panel, keys: string[], selected: string | null) {
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const list = listRef.current;
    const active = list?.querySelector<HTMLAnchorElement>("a.active");
    if (!active) return;
    // Keyboard focus follows the cursor, so there is never a second highlighted row.
    if (list!.contains(document.activeElement)) active.focus({ preventScroll: true });
    active.scrollIntoView({ block: "nearest" });
  }, [selected]);

  function onKeyDown(e: KeyboardEvent) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    if (e.target instanceof HTMLSelectElement) return;
    e.preventDefault();
    const at = selected ? keys.indexOf(selected) : -1;
    const next = Math.max(0, Math.min(keys.length - 1, at + (e.key === "ArrowDown" ? 1 : -1)));
    // replace() so holding an arrow key doesn't flood the back-button history
    if (keys[next] && keys[next] !== selected) location.replace(href(panel, keys[next]));
  }

  return { listRef, onKeyDown };
}

/**
 * A species sprite from public/sprites, drawn with crisp pixels.
 * `front` is the 64px battle sprite; `icon` is the 32px party icon, which bobs between its two
 * frames when `bob` is set. Falls back to a faded Poké Ball when there is no sprite.
 */
export function Sprite({
  dex,
  speciesKey,
  kind = "front",
  scale = 1,
  bob,
  className = "",
}: {
  dex: Dex;
  speciesKey: string;
  kind?: "front" | "icon";
  scale?: number;
  bob?: boolean;
  className?: string;
}) {
  const entry = dex.sprites[speciesKey];
  const size = (kind === "front" ? 64 : 32) * scale;
  const file = speciesKey.replace(/^SPECIES_/, "") + (kind === "icon" ? ".icon" : "");
  const available = entry && (kind === "front" || entry.icon);
  if (!available) {
    return (
      <span className={`sprite missing ${className}`} style={{ width: size, height: size }} title="No sprite available">
        <PokeBall state="open" />
      </span>
    );
  }
  return (
    <span
      className={`sprite ${kind}${bob ? " bob" : ""} ${className}`}
      style={{
        width: size,
        height: size,
        backgroundImage: `url(${import.meta.env.BASE_URL}sprites/${file}.png)`,
        ["--frame" as string]: `${-size}px`,
      }}
      title={entry.base ? "Base form's sprite (this form has none of its own)" : undefined}
      role="img"
      aria-label={speciesKey}
    />
  );
}
