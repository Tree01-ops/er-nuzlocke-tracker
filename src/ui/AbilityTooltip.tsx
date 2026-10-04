import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { flagFor } from "../data/flags.ts";
import { normalizeName } from "../data/keys.ts";
import type { Dex } from "../data/load.ts";
import { FlagBadge } from "./Flags.tsx";
import { useRuns } from "./useRuns.ts";

const SHOW_DELAY = 220;
const GAP = 8;

/**
 * One Pokédex-styled tooltip for every ability on the page. Anything with
 * data-ability="<ability key>" gets it on hover or keyboard focus.
 */
export function AbilityTooltip({ dex }: { dex: Dex }) {
  const { run } = useRuns();
  const [target, setTarget] = useState<{ key: string; el: Element } | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number; above: boolean } | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const find = (e: Event) => (e.target instanceof Element ? e.target.closest("[data-ability]") : null);
    const show = (e: Event) => {
      const el = find(e);
      clearTimeout(timer);
      if (!el) return;
      timer = setTimeout(() => setTarget({ key: el.getAttribute("data-ability")!, el }), SHOW_DELAY);
    };
    const hide = (e: Event) => {
      const el = find(e);
      const to = (e as MouseEvent | FocusEvent).relatedTarget;
      if (el && to instanceof Node && el.contains(to)) return; // still inside the same element
      clearTimeout(timer);
      setTarget(null);
    };
    const reset = () => {
      clearTimeout(timer);
      setTarget(null);
    };
    document.addEventListener("pointerover", show);
    document.addEventListener("pointerout", hide);
    document.addEventListener("focusin", show);
    document.addEventListener("focusout", hide);
    document.addEventListener("scroll", reset, true);
    window.addEventListener("hashchange", reset);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("pointerover", show);
      document.removeEventListener("pointerout", hide);
      document.removeEventListener("focusin", show);
      document.removeEventListener("focusout", hide);
      document.removeEventListener("scroll", reset, true);
      window.removeEventListener("hashchange", reset);
    };
  }, []);

  // Below the element if it fits, otherwise above; kept inside the window.
  useLayoutEffect(() => {
    if (!target || !box.current) return setPos(null);
    const r = target.el.getBoundingClientRect();
    const b = box.current.getBoundingClientRect();
    const above = r.bottom + GAP + b.height > innerHeight && r.top - GAP - b.height > 0;
    const top = above ? r.top - GAP - b.height : r.bottom + GAP;
    const left = Math.max(GAP, Math.min(r.left, innerWidth - b.width - GAP));
    setPos({ left, top, above });
  }, [target]);

  const index = target ? dex.abilityByKey.get(target.key) : undefined;
  if (!target || index === undefined) return null;
  const a = dex.abilities[index];
  const composite = dex.composites.get(index);
  const flag = run ? flagFor(dex, dex.composites, run, index) : null;
  const parts = composite?.components.map((i) => dex.abilities[i].name) ?? [];
  // "Made of" adds nothing when the description is just "A + B + C."
  const showParts = parts.length > 0 && normalizeName(a.desc) !== normalizeName(parts.join(""));

  return (
    <div
      ref={box}
      role="tooltip"
      className={`ability-tip${pos ? " shown" : ""}${pos?.above ? " above" : ""}`}
      style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: 0 }}
    >
      <div className="tip-head">
        <span className="tip-name">{a.name}</span>
        {flag && <FlagBadge dex={dex} flag={flag} />}
      </div>
      <p className="tip-desc">{a.desc}</p>
      {showParts && (
        <p className="tip-made">
          <span className="label">Made of</span> {parts.join(" + ")}
        </p>
      )}
      {flag && flag.via.length > 0 && (
        <p className="tip-made">
          <span className="label">Flagged by</span> {flag.via.map((i) => dex.abilities[i].name).join(", ")}
        </p>
      )}
    </div>
  );
}
