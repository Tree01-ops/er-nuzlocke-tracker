// Export / import of a single run, as a JSON file or a short text code.
// The code is the same JSON, deflate-compressed and base64url-encoded, prefixed "ERN1.".

import type { Run } from "./model.ts";

const APP = "er-nuzlocke";
const FORMAT = 1;
const CODE_PREFIX = "ERN1.";

export type ExportFile = { app: typeof APP; format: number; exportedAt: string; run: Run };

export function toExportJson(run: Run): string {
  const file: ExportFile = { app: APP, format: FORMAT, exportedAt: new Date().toISOString(), run };
  return JSON.stringify(file, null, 2);
}

export function exportFileName(run: Run): string {
  const safe = run.name.replace(/[^a-z0-9-_ ]/gi, "").trim().replace(/\s+/g, "-") || "run";
  return `er-nuzlocke-${safe}-${new Date().toISOString().slice(0, 10)}.json`;
}

/** Parses an export file's text. Throws with a readable message when it isn't one. */
export function fromExportJson(text: string): Run {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("That file isn't valid JSON.");
  }
  const file = data as Partial<ExportFile>;
  if (file?.app !== APP || typeof file.format !== "number") throw new Error("That isn't an ER Nuzlocke export.");
  if (file.format > FORMAT) throw new Error("That export is from a newer version of the app.");
  return normalizeRun(file.run);
}

export async function toCode(run: Run): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify({ app: APP, format: FORMAT, run }));
  const packed = await pipe(bytes, new CompressionStream("deflate-raw"));
  return CODE_PREFIX + toBase64Url(packed);
}

export async function fromCode(code: string): Promise<Run> {
  const trimmed = code.replace(/\s+/g, "");
  if (!trimmed.startsWith(CODE_PREFIX)) throw new Error('A run code starts with "ERN1.".');
  let text: string;
  try {
    const bytes = await pipe(fromBase64Url(trimmed.slice(CODE_PREFIX.length)), new DecompressionStream("deflate-raw"));
    text = new TextDecoder().decode(bytes);
  } catch {
    throw new Error("That code is damaged or incomplete.");
  }
  return fromExportJson(text);
}

/**
 * Minimal shape check so a bad import can't break the app. Fills in collections added in later
 * app versions, so it also upgrades runs saved by older builds.
 */
export function normalizeRun(value: unknown): Run {
  const r = value as Partial<Run>;
  if (!r || typeof r !== "object" || typeof r.id !== "string" || typeof r.name !== "string") {
    throw new Error("The export doesn't contain a run.");
  }
  return {
    id: r.id,
    name: r.name,
    version: typeof r.version === "string" ? r.version : "",
    createdAt: r.createdAt ?? Date.now(),
    updatedAt: r.updatedAt ?? Date.now(),
    ...(typeof r.exportedAt === "number" ? { exportedAt: r.exportedAt } : {}),
    rules: { stackLimit: 1, duplicatesClause: true, rerollOnBan: true, ...r.rules },
    bans: Array.isArray(r.bans) ? r.bans : [],
    limited: Array.isArray(r.limited) ? r.limited : [],
    speciesOverrides: r.speciesOverrides ?? {},
    areas: r.areas ?? {},
    mons: r.mons ?? {},
    party: Array.isArray(r.party) ? r.party : [],
    box: Array.isArray(r.box) ? r.box : [],
    graveyard: Array.isArray(r.graveyard) ? r.graveyard : [],
  };
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array {
  const bin = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
