import builtinFile from "../../data/thoughts.json";
import { lang, t } from "../i18n";
import builtinPt from "../../data/thoughts.pt.json";
import type { Storage } from "../storage/types";
import { isoDate, parseLocal, stamp } from "./dates";
import type { Data } from "./frontmatter";
import type { Note, Notes } from "./notes";

// Thoughts (SPEC 5.10): a built-in library shipped with the app (data/thoughts.json, read-only)
// plus the user's own, one file each in thoughts/. Favorites of built-in thoughts and the
// thought picked for a day live in .hypomnemata/thoughts-state.json; an own thought keeps its
// `favorite` in its header.

export type Kind = "mine" | "verified" | "uncertain";

/** Label and hint of each kind are in i18n (thoughts.kinds). */
export const KINDS: { id: Kind }[] = [{ id: "mine" }, { id: "verified" }, { id: "uncertain" }];

export interface Thought {
  id: string;
  kind: Kind;
  text: string;
  author: string;
  era: string;
  work: string;
  reference: string;
  tradition: string;
  themes: string[];
  language: string;
  translation: string;
  source: string;
  notes: string;
  favorite: boolean;
  builtin: boolean;
  /** Own thoughts: thoughts/<id>.md */
  path?: string;
  note?: Note;
  /** Own thoughts sent from a book quote: the quote's path. */
  quote?: string;
  created: string;
}

export const THOUGHTS_DIR = "thoughts";
export const STATE_PATH = ".hypomnemata/thoughts-state.json";
export const MAX_TEXT = 1500;

const str = (v: unknown) => (v === undefined || v === null ? "" : String(v));
const strList = (v: unknown) => (Array.isArray(v) ? v.map(str).map(s => s.trim()).filter(Boolean) : []);

/** Themes: lowercase, single spaces, no repeats. */
export function cleanThemes(list: string[]): string[] {
  const out: string[] = [];
  for (const t of list) {
    const c = t.split(/\s+/).filter(Boolean).join(" ").toLowerCase();
    if (c && !out.includes(c)) out.push(c);
  }
  return out;
}

export const parseThemes = (text: string) => cleanThemes(text.split(","));

/** The built-in library. Items with a missing id, text or author are left out. */
export const BUILTIN: Thought[] = (() => {
  const seen = new Set<string>();
  const out: Thought[] = [];
  for (const x of (builtinFile as { thoughts: Record<string, unknown>[] }).thoughts) {
    const id = str(x.id);
    if (!id || seen.has(id) || !str(x.text).trim() || !str(x.author).trim()) continue;
    seen.add(id);
    out.push({
      id,
      kind: x.kind === "uncertain" ? "uncertain" : "verified",
      text: str(x.text),
      author: str(x.author),
      era: str(x.era),
      work: str(x.work),
      reference: str(x.reference),
      tradition: str(x.tradition),
      themes: cleanThemes(strList(x.themes)),
      language: str(x.language),
      translation: str(x.translation),
      source: str(x.source),
      notes: str(x.notes),
      favorite: false,
      builtin: true,
      created: "",
    });
  }
  return out;
})();

/**
 * A built-in thought in the app's language. In Portuguese the facts around the quote (author,
 * work, notes…) come from data/thoughts.pt.json; the quote stays in its English translation,
 * except the Portuguese originals (Machado, Pessoa).
 */
const PT = (builtinPt as { thoughts: Record<string, Partial<Record<keyof Thought, unknown>>> }).thoughts;
export function localized(th: Thought): Thought {
  const p = lang === "pt-BR" ? PT[th.id] : undefined;
  if (!p) return th;
  const s = (k: keyof Thought) => (typeof p[k] === "string" ? (p[k] as string) : (th[k] as string));
  return {
    ...th,
    text: s("text"),
    author: s("author"),
    era: s("era"),
    work: s("work"),
    reference: s("reference"),
    tradition: s("tradition"),
    language: s("language"),
    translation: s("translation"),
    notes: s("notes"),
    themes: Array.isArray(p.themes) ? cleanThemes(p.themes.map(String)) : th.themes,
  };
}

// --- State file ------------------------------------------------------------------------------

export interface ThoughtsState {
  /** Built-in thoughts marked as favorites. */
  favorites: string[];
  /** Day (2026-10-17) → id of the thought picked for that day. */
  days: Record<string, string>;
}

export class StateError extends Error {}

/**
 * Reads the state. A file that exists but cannot be read gives a StateError: saving over it
 * would lose the user's favorites and choices (as MyNotes did).
 */
export async function loadState(s: Storage): Promise<ThoughtsState> {
  if (!(await s.stat(STATE_PATH))) return { favorites: [], days: {} };
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(await s.read(STATE_PATH));
  } catch {
    throw new StateError(t.thoughts.stateBroken(STATE_PATH));
  }
  const days: Record<string, string> = {};
  if (raw.days && typeof raw.days === "object") {
    for (const [k, v] of Object.entries(raw.days as Record<string, unknown>)) {
      if (parseLocal(k) && typeof v === "string" && v) days[k] = v;
    }
  }
  return { favorites: [...new Set(strList(raw.favorites))], days };
}

async function saveState(s: Storage, change: (st: ThoughtsState) => void) {
  const st = await loadState(s); // throws when unreadable: never write over it
  let old: Record<string, unknown> = {};
  if (await s.stat(STATE_PATH)) old = JSON.parse(await s.read(STATE_PATH));
  change(st);
  const next = { ...old, version: 1, favorites: [...st.favorites].sort(), days: st.days };
  await s.write(STATE_PATH, JSON.stringify(next, null, 2) + "\n");
}

// --- Own thoughts ----------------------------------------------------------------------------

export const isThoughtPath = (path: string) => /^thoughts\/[^/]+\.md$/.test(path);
const idOf = (path: string) => path.replace(/^thoughts\//, "").replace(/\.md$/, "");

export function toThought(note: Note): Thought {
  const d = note.data;
  const kind = KINDS.some(k => k.id === d.kind) ? (d.kind as Kind) : "mine";
  return {
    id: idOf(note.path),
    kind,
    text: note.body.trim(),
    author: str(d.author),
    era: str(d.era),
    work: str(d.work),
    reference: str(d.reference),
    tradition: str(d.tradition),
    themes: cleanThemes(strList(d.themes)),
    language: str(d.language),
    translation: str(d.translation),
    source: str(d.source),
    notes: str(d.notes),
    favorite: d.favorite === true,
    builtin: false,
    path: note.path,
    note,
    quote: d.quote ? str(d.quote) : undefined,
    created: str(d.created),
  };
}

/** Built-in thoughts first (in file order), then the user's own, newest first. */
export async function loadThoughts(notes: Notes, onError?: (path: string) => void): Promise<{ all: Thought[]; state: ThoughtsState; stateError?: string }> {
  const own = (await notes.loadDir(THOUGHTS_DIR, p => onError?.(p)))
    .filter(n => n.data.type === undefined || n.data.type === "thought")
    .map(toThought)
    .sort((a, b) => b.created.localeCompare(a.created) || b.id.localeCompare(a.id));
  let state: ThoughtsState = { favorites: [], days: {} };
  let stateError: string | undefined;
  try {
    state = await loadState(notes.storage);
  } catch (e) {
    stateError = e instanceof Error ? e.message : String(e);
  }
  const fav = new Set(state.favorites);
  const builtin = BUILTIN.map(x => ({ ...localized(x), favorite: fav.has(x.id) }));
  return { all: [...builtin, ...own], state, stateError };
}

export interface Fields {
  kind: Kind;
  text: string;
  author?: string;
  work?: string;
  reference?: string;
  source?: string;
  themes?: string[];
  quote?: string;
}

/** What is wrong with a new or edited thought (SPEC 5.10); empty when it can be saved. */
export function problems(f: Fields): string[] {
  const out: string[] = [];
  const text = f.text.trim();
  if (!text) out.push(t.thoughts.writeIt);
  else if (text.length > MAX_TEXT) out.push(t.thoughts.tooLong(text.length, MAX_TEXT));
  if (f.kind === "verified") {
    if (!f.author?.trim()) out.push(t.thoughts.needAuthor);
    if (!f.source?.trim()) out.push(t.thoughts.needSource);
  } else if (f.kind === "uncertain" && !f.author?.trim()) out.push(t.thoughts.needAttribution);
  return out;
}

/** Text + author without accents, case, punctuation and extra spaces: finds repeats. */
export function dupKey(text: string, author: string): string {
  const clean = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter(Boolean)
      .join(" ");
  return `${clean(text)}|${clean(author)}`;
}

export function findDuplicate(all: Thought[], f: { text: string; author?: string }, exceptId?: string): Thought | undefined {
  const k = dupKey(f.text, f.author ?? "");
  return all.find(t => t.id !== exceptId && dupKey(t.text, t.author) === k);
}

export class ThoughtError extends Error {}

function check(all: Thought[], f: Fields, exceptId?: string) {
  const errs = problems(f);
  const dup = errs.length ? undefined : findDuplicate(all, f, exceptId);
  if (dup) errs.push(t.thoughts.duplicate(dup.author));
  if (errs.length) throw new ThoughtError(errs.join("\n"));
}

const empty = (s?: string) => (s && s.trim() ? s.trim() : undefined);

function header(f: Fields): Data {
  return {
    type: "thought",
    kind: f.kind,
    author: empty(f.author),
    work: empty(f.work),
    reference: empty(f.reference),
    source: empty(f.source),
    themes: f.themes && f.themes.length ? cleanThemes(f.themes) : undefined,
    quote: empty(f.quote),
  };
}

export async function createThought(notes: Notes, all: Thought[], f: Fields, now = new Date()): Promise<Note> {
  check(all, f);
  const path = await notes.freePath(THOUGHTS_DIR, stamp(now));
  return notes.create(path, header(f), f.text.trim() + "\n");
}

/** Saves an own thought; keys the form does not know (favorite, hand-added ones) are kept. */
export async function saveThought(notes: Notes, all: Thought[], th: Thought, f: Fields): Promise<Note> {
  if (!th.note) throw new ThoughtError(t.thoughts.builtinLocked);
  check(all, f, th.id);
  const { type: _t, kind: _k, author: _a, work: _w, reference: _r, source: _s, themes: _th, quote: _q, ...rest } = th.note.data;
  return notes.save(th.note, { ...header(f), ...rest, quote: empty(f.quote) ?? th.quote }, f.text.trim() + "\n");
}

/** Marks or unmarks a favorite. Returns a function that puts it back (Undo). */
export async function setFavorite(notes: Notes, t: Thought, on: boolean): Promise<() => Promise<void>> {
  if (!t.builtin && t.path) {
    const old = await notes.patchHeader(t.path, { favorite: on ? true : undefined });
    return async () => void (await notes.patchHeader(t.path!, old));
  }
  const was = t.favorite;
  await saveState(notes.storage, st => {
    st.favorites = st.favorites.filter(id => id !== t.id);
    if (on) st.favorites.push(t.id);
  });
  return () =>
    saveState(notes.storage, st => {
      st.favorites = st.favorites.filter(id => id !== t.id);
      if (was) st.favorites.push(t.id);
    });
}

/** "Use as today's thought": fixes it for that day. Returns Undo. */
export async function pickForDay(s: Storage, id: string, day = isoDate()): Promise<() => Promise<void>> {
  let before: string | undefined;
  await saveState(s, st => {
    before = st.days[day];
    st.days[day] = id;
  });
  return () =>
    saveState(s, st => {
      if (before) st.days[day] = before;
      else delete st.days[day];
    });
}

// --- Thought of the day ----------------------------------------------------------------------

/** Days since 0001-01-01 counted from 1 (Python's date.toordinal, used by MyNotes). */
export function dayNumber(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  const t = new Date(0);
  t.setUTCFullYear(y, m - 1, d); // Date.UTC would read years 0–99 as 1900–1999
  return Math.round(t.getTime() / 86400000) + 719163;
}

/**
 * The thought of a day: the one picked for it, else a built-in one that changes every day and
 * stays the same all day (SPEC 5.10).
 */
export function thoughtOfDay(all: Thought[], state: ThoughtsState, day = isoDate()): { thought: Thought; picked: boolean } | null {
  const id = state.days[day];
  const chosen = id ? all.find(t => t.id === id) : undefined;
  if (chosen) return { thought: chosen, picked: true };
  const base = all.filter(t => t.builtin);
  const list = base.length ? base : all;
  return list.length ? { thought: list[dayNumber(day) % list.length], picked: false } : null;
}

export function randomThought(all: Thought[], avoid?: string, rnd = Math.random): Thought | undefined {
  const pool = all.filter(t => t.id !== avoid);
  const list = pool.length ? pool : all;
  return list.length ? list[Math.floor(rnd() * list.length)] : undefined;
}

// --- Filters ---------------------------------------------------------------------------------

export type Origin = "builtin" | "mine" | "uncertain";

export interface Filter {
  text?: string;
  author?: string;
  tradition?: string;
  theme?: string;
  origin?: Origin;
  favorites?: boolean;
}

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function filterThoughts(all: Thought[], f: Filter): Thought[] {
  const q = fold(f.text?.trim() ?? "");
  return all.filter(t => {
    if (f.author && t.author !== f.author) return false;
    if (f.tradition && t.tradition !== f.tradition) return false;
    if (f.theme && !t.themes.includes(f.theme)) return false;
    if (f.origin === "builtin" && !t.builtin) return false;
    if (f.origin === "mine" && t.builtin) return false;
    if (f.origin === "uncertain" && t.kind !== "uncertain") return false;
    if (f.favorites && !t.favorite) return false;
    if (q && ![t.text, t.author, t.work, t.reference, t.tradition, t.notes, ...t.themes].some(x => x && fold(x).includes(q)))
      return false;
    return true;
  });
}

/** Sorted distinct values for the filter menus. */
export function values(all: Thought[], key: "author" | "tradition" | "themes"): string[] {
  const set = new Set<string>();
  for (const t of all) {
    const v = t[key];
    for (const x of Array.isArray(v) ? v : [v]) if (x) set.add(x);
  }
  return [...set].sort((a, b) => fold(a).localeCompare(fold(b)));
}

/** "Seneca, Letters to Lucilius, Letter 1, §3" */
export function citation(t: Thought): string {
  return [t.author, t.work, t.reference].filter(Boolean).join(", ");
}
