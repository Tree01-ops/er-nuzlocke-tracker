// Run data and the pure functions that change it. No UI or storage code here.
// Everything refers to species by key (SPECIES_X) and abilities by ability key, never by
// array index, so a run survives switching data versions.

// Elite Redux auto-catches wild encounters, so an area is either open or caught.
export type AreaStatus = "caught";

export type EncounterLog = { species: string; outcome: "rerolled" };

export type AreaRecord = {
  status?: AreaStatus;
  species?: string;
  monId?: string;
  notes?: string;
  /** Encounters thrown back before the final one. */
  rerolls?: EncounterLog[];
};

export type Mon = {
  id: string;
  species: string;
  nickname?: string;
  area: string;
  caughtAt: number;
};

export type GraveEntry = { monId: string; cause?: string; diedAt: number };

export type Rules = {
  /** Max flagged abilities per Pokémon, counting innates (Phase 3). */
  stackLimit: number;
  duplicatesClause: boolean;
  rerollOnBan: boolean;
};

/**
 * Randomized abilities recorded for a species: 3 ability slots and 3 innates, each an ability
 * key, "custom:<text>" for a name the data doesn't know, or "" when not known yet.
 */
export type SpeciesOverride = { abilities: string[]; innates: string[] };

export type Run = {
  id: string;
  name: string;
  version: string;
  createdAt: number;
  updatedAt: number;
  /** Last time this run was exported (file or code), for the backup reminder. */
  exportedAt?: number;
  rules: Rules;
  /** Ability keys that are banned outright. */
  bans: string[];
  /** Ability keys that count toward the stack limit. */
  limited: string[];
  speciesOverrides: Record<string, SpeciesOverride>;
  areas: Record<string, AreaRecord>;
  mons: Record<string, Mon>;
  party: string[];
  box: string[];
  graveyard: GraveEntry[];
};

export const PARTY_SIZE = 6;

export function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function createRun(name: string, version: string, now = Date.now()): Run {
  return {
    id: newId(),
    name,
    version,
    createdAt: now,
    updatedAt: now,
    rules: { stackLimit: 1, duplicatesClause: true, rerollOnBan: true },
    bans: [],
    limited: [],
    speciesOverrides: {},
    areas: {},
    mons: {},
    party: [],
    box: [],
    graveyard: [],
  };
}

// Each change returns a new Run; the caller stores it.

function touch(run: Run, patch: Partial<Run>): Run {
  return { ...run, ...patch, updatedAt: Date.now() };
}

function setArea(run: Run, area: string, record: AreaRecord): Run {
  return touch(run, { areas: { ...run.areas, [area]: record } });
}

/** Catch the area's encounter. Goes to the party if there is room, otherwise the box. */
export function catchMon(run: Run, area: string, species: string, nickname?: string): Run {
  const mon: Mon = { id: newId(), species, area, caughtAt: Date.now() };
  if (nickname?.trim()) mon.nickname = nickname.trim();
  const toParty = run.party.length < PARTY_SIZE;
  const prev = run.areas[area] ?? {};
  return touch(run, {
    areas: { ...run.areas, [area]: { ...prev, status: "caught", species, monId: mon.id } },
    mons: { ...run.mons, [mon.id]: mon },
    party: toParty ? [...run.party, mon.id] : run.party,
    box: toParty ? run.box : [...run.box, mon.id],
  });
}

/** Throw the encounter back (banned ability, duplicate...) and keep the area open. */
export function rerollEncounter(run: Run, area: string, species: string): Run {
  const prev = run.areas[area] ?? {};
  return setArea(run, area, { ...prev, rerolls: [...(prev.rerolls ?? []), { species, outcome: "rerolled" }] });
}

/** Reopen an area. A Pokémon caught there is removed from the run entirely. */
export function reopenArea(run: Run, area: string): Run {
  const prev = run.areas[area];
  if (!prev) return run;
  let next = run;
  if (prev.monId) next = removeMon(next, prev.monId);
  const { notes, rerolls } = prev;
  return setArea(next, area, { notes, rerolls });
}

/** Remove a caught Pokémon from the run; the route it came from opens again. */
export function releaseMon(run: Run, monId: string): Run {
  const mon = run.mons[monId];
  if (!mon) return run;
  if (run.areas[mon.area]?.monId === monId) return reopenArea(run, mon.area);
  return removeMon(run, monId);
}

export function setAreaNotes(run: Run, area: string, notes: string): Run {
  const prev = run.areas[area] ?? {};
  return setArea(run, area, { ...prev, notes: notes || undefined });
}

function removeMon(run: Run, monId: string): Run {
  const mons = { ...run.mons };
  delete mons[monId];
  return touch(run, { mons, ...withoutMon(run, monId) });
}

function withoutMon(run: Run, monId: string) {
  return {
    party: run.party.filter((id) => id !== monId),
    box: run.box.filter((id) => id !== monId),
    graveyard: run.graveyard.filter((g) => g.monId !== monId),
  };
}

export type Place = "party" | "box" | "graveyard";

export function placeOf(run: Run, monId: string): Place | null {
  if (run.party.includes(monId)) return "party";
  if (run.box.includes(monId)) return "box";
  if (run.graveyard.some((g) => g.monId === monId)) return "graveyard";
  return null;
}

/** Move to party or box. Moving to a full party is refused (returns the run unchanged). */
export function moveMon(run: Run, monId: string, to: "party" | "box"): Run {
  if (!run.mons[monId] || placeOf(run, monId) === to) return run;
  if (to === "party" && run.party.length >= PARTY_SIZE) return run;
  const rest = withoutMon(run, monId);
  return touch(run, { ...rest, [to]: [...rest[to], monId] });
}

export function killMon(run: Run, monId: string, cause?: string): Run {
  if (!run.mons[monId] || placeOf(run, monId) === "graveyard") return run;
  const rest = withoutMon(run, monId);
  const entry: GraveEntry = { monId, diedAt: Date.now() };
  if (cause?.trim()) entry.cause = cause.trim();
  return touch(run, { ...rest, graveyard: [...rest.graveyard, entry] });
}

export function renameMon(run: Run, monId: string, nickname: string): Run {
  const mon = run.mons[monId];
  if (!mon) return run;
  const next = { ...mon, nickname: nickname.trim() || undefined };
  return touch(run, { mons: { ...run.mons, [monId]: next } });
}

/** Reorder within the party: move monId one slot up (-1) or down (+1). */
export function shiftInParty(run: Run, monId: string, by: -1 | 1): Run {
  const i = run.party.indexOf(monId);
  const j = i + by;
  if (i < 0 || j < 0 || j >= run.party.length) return run;
  const party = [...run.party];
  [party[i], party[j]] = [party[j], party[i]];
  return touch(run, { party });
}

/** Records an export. Doesn't count as a change to the run itself. */
export function markExported(run: Run, now = Date.now()): Run {
  return { ...run, exportedAt: now };
}

const DAY = 24 * 60 * 60 * 1000;

/**
 * Whether to nag about backups: there is unexported progress, and either the run has never been
 * exported (once it has a few Pokémon) or the last export is over a week old.
 */
export function needsBackup(run: Run, now = Date.now()): boolean {
  const changed = run.updatedAt > (run.exportedAt ?? 0);
  if (!changed) return false;
  if (!run.exportedAt) return Object.keys(run.mons).length >= 3 || now - run.createdAt > DAY;
  return now - run.exportedAt > 7 * DAY;
}

export function renameRun(run: Run, name: string): Run {
  return touch(run, { name: name.trim() || run.name });
}

export function setRunVersion(run: Run, version: string): Run {
  return run.version === version ? run : touch(run, { version });
}

// ---- Randomized abilities and ban rules ----

export function setOverride(run: Run, speciesKey: string, override: SpeciesOverride): Run {
  const overrides = { ...run.speciesOverrides };
  const clean = {
    abilities: [0, 1, 2].map((i) => override.abilities[i] ?? ""),
    innates: [0, 1, 2].map((i) => override.innates[i] ?? ""),
  };
  if ([...clean.abilities, ...clean.innates].some(Boolean)) overrides[speciesKey] = clean;
  else delete overrides[speciesKey];
  return touch(run, { speciesOverrides: overrides });
}

/** Sets one ability to allowed, limited or banned. */
export function setAbilityRule(run: Run, key: string, rule: "allowed" | "limited" | "banned"): Run {
  const bans = run.bans.filter((k) => k !== key);
  const limited = run.limited.filter((k) => k !== key);
  if (rule === "banned") bans.push(key);
  if (rule === "limited") limited.push(key);
  return touch(run, { bans, limited });
}

/** Applies a preset's keys with its rule (on) or clears them back to allowed (off). */
export function applyPreset(run: Run, keys: string[], rule: "limited" | "banned", on: boolean): Run {
  let next = run;
  for (const key of keys) next = setAbilityRule(next, key, on ? rule : "allowed");
  return next;
}

export function setRules(run: Run, patch: Partial<Rules>): Run {
  return touch(run, { rules: { ...run.rules, ...patch } });
}
