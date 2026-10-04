// Shared helpers for scripts that pull assets from the Elite Redux game source on GitHub.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { SPRITE_BRANCH as BRANCH, SPRITE_REPO as REPO } from "../config/sprites.ts";

const RAW = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/`;
const TREE_CACHE = ".cache/er-source-tree.json";

/** Every file path in the repo (one GitHub API call, cached). */
export async function erTree(refresh: boolean): Promise<Set<string>> {
  if (refresh || !existsSync(TREE_CACHE)) {
    const url = `https://api.github.com/repos/${REPO}/git/trees/${BRANCH}?recursive=1`;
    console.log(`Listing ${url}`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status} listing ${REPO}`);
    mkdirSync(".cache", { recursive: true });
    writeFileSync(TREE_CACHE, await res.text());
  }
  const data = JSON.parse(readFileSync(TREE_CACHE, "utf8")) as { tree: { path: string }[] };
  return new Set(data.tree.map((t) => t.path));
}

/** Downloads one repo file, caching it under `cacheDir`. Null if it doesn't exist. */
export async function erDownload(path: string, cacheDir: string, refresh: boolean): Promise<Buffer | null> {
  const cached = `${cacheDir}/${path.replace(/\//g, "__")}`;
  if (!refresh && existsSync(cached)) return readFileSync(cached);
  let res: Response | null = null;
  for (let attempt = 1; !res; attempt++) {
    try {
      res = await fetch(RAW + path);
    } catch (e) {
      if (attempt >= 3) throw e; // network hiccups: try a couple more times
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(cached, buf);
  return buf;
}

export async function pool<T>(items: T[], size: number, work: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (next < items.length) await work(items[next++]);
    }),
  );
}

/** Species keys from every built data version (public/data/*.json). */
export function allSpeciesKeys(readdir: (dir: string) => string[]): string[] {
  const keys = new Set<string>();
  for (const f of readdir("public/data")) {
    if (f === "versions.json" || !f.endsWith(".json")) continue;
    const data = JSON.parse(readFileSync(`public/data/${f}`, "utf8")) as { species: { key: string }[] };
    for (const s of data.species.slice(1)) keys.add(s.key);
  }
  return [...keys];
}
