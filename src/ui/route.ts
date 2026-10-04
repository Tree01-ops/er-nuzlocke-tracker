import { useEffect, useState } from "react";

// Hash routes: #/<panel>/<item key>. Hash routing works on any static host without config.

export type Panel = "run" | "areas" | "species" | "abilities" | "rules";
export type Route = { panel: Panel; item: string | null };

const PANELS: Panel[] = ["run", "areas", "species", "abilities", "rules"];

function parse(hash: string): Route {
  const [panel, ...rest] = hash.replace(/^#\/?/, "").split("/");
  return {
    panel: PANELS.includes(panel as Panel) ? (panel as Panel) : "species",
    item: rest.length ? decodeURIComponent(rest.join("/")) : null,
  };
}

export function href(panel: Panel, item?: string | null): string {
  return `#/${panel}${item ? "/" + encodeURIComponent(item) : ""}`;
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parse(location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parse(location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}
