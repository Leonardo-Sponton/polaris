import { stamp } from "./dates";
import type { Note, Notes } from "./notes";
import { itemParts, type Moved } from "./inbox";
import { fold } from "./search";

// Notes: longer writing kept as it is (not a to-do, not an idea). One file per note in notes/,
// named by its creation time so a new title never renames the file. The "# " heading (or the
// first line) is the title. `pinned: true` keeps a note at the top of the list.

export interface FullNote {
  path: string;
  title: string;
  /** The first lines after the title, without Markdown marks. */
  preview: string;
  modified: string;
  pinned: boolean;
  /** Title and body folded (no accents, lowercase), for the list filter. */
  folded: string;
}

const MARKS = /^\s*(#+|>|[-*+]( \[[ xX]\])?|\d+\.)\s*/;

export function toFullNote(n: Note): FullNote {
  const { title, rest } = itemParts(n.body);
  const preview = rest
    .split("\n")
    .map(l => l.replace(MARKS, "").replace(/[*_~`]/g, "").trim())
    .filter(Boolean)
    .join(" · ")
    .slice(0, 160);
  return {
    path: n.path,
    title,
    preview,
    modified: String(n.data.modified ?? n.data.created ?? ""),
    pinned: n.data.pinned === true,
    folded: fold(`${title}\n${n.body}`).folded,
  };
}

/** Pinned first, then the most recently changed. */
export async function loadFullNotes(notes: Notes, onError?: (path: string) => void): Promise<FullNote[]> {
  const list = (await notes.loadDir("notes", p => onError?.(p))).map(toFullNote);
  return list.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.modified.localeCompare(a.modified) || b.path.localeCompare(a.path));
}

/** Every word of the filter must be in the title or the text (accents and capitals ignored). */
export function filterNotes(list: FullNote[], query: string): FullNote[] {
  const words = fold(query).folded.split(/\s+/).filter(Boolean);
  return words.length ? list.filter(n => words.every(w => n.folded.includes(w))) : list;
}

export async function createFullNote(notes: Notes, body = "", at = new Date()): Promise<Note> {
  return notes.create(await notes.freePath("notes", stamp(at)), { type: "note" }, body);
}

export const setPinned = (notes: Notes, path: string, pinned: boolean) =>
  notes.patchHeader(path, { pinned: pinned || undefined });

/** Inbox item → note (same text and created time). */
export async function inboxToNote(notes: Notes, path: string): Promise<Moved> {
  const n = await notes.load(path);
  const name = /(\d{8}-\d{6})/.exec(path)?.[1] ?? stamp();
  const to = await notes.freePath("notes", name);
  const { type: _t, ...keep } = n.data;
  const moved = await notes.relocate(n, to, { type: "note", ...keep }, n.body);
  return { from: n, to: moved };
}
