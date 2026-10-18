import { stamp } from "./dates";
import type { Note, Notes } from "./notes";
import { itemParts, type Moved } from "./inbox";
import { fold } from "./search";

// Notes: longer writing kept as it is (not a to-do, not an idea). One file per note in notes/,
// named by its creation time so a new title never renames the file. The "# " heading (or the
// first line) is the title. `pinned: true` keeps a note at the top of the list. Words like
// #trip or #school/ads in the text are tags, offered as filters in the list.

export interface FullNote {
  path: string;
  title: string;
  /** The first lines after the title, without Markdown marks. */
  preview: string;
  modified: string;
  created: string;
  pinned: boolean;
  /** #tags in the text (without "#", lowercase), A–Z. */
  tags: string[];
  /** Title and body folded (no accents, lowercase), for the list filter. */
  folded: string;
}

const MARKS = /^\s*(#+|>|[-*+]( \[[ xX]\])?|\d+\.)\s*/;

/** "#tag" words outside code: a letter first, then letters, digits, _ - /. Headings ("# x") are not tags. */
export function tagsOf(body: string): string[] {
  const out = new Set<string>();
  let fence = false;
  for (const line of body.split("\n")) {
    if (/^\s*(`{3,}|~{3,})/.test(line)) fence = !fence;
    if (fence) continue;
    for (const m of line.replace(/`[^`]*`/g, "").matchAll(/(^|[\s(])#(\p{L}[\p{L}\p{N}_/-]*)/gu)) out.add(m[2].toLowerCase().replace(/[/-]+$/, ""));
  }
  return [...out].sort((a, b) => a.localeCompare(b));
}

export type NoteSort = "modified" | "newest" | "oldest" | "title";
export const NOTE_SORTS: NoteSort[] = ["modified", "newest", "oldest", "title"];

/** Pinned first, then by the chosen order. */
export function sortNotes(list: FullNote[], by: NoteSort): FullNote[] {
  const cmp: Record<NoteSort, (a: FullNote, b: FullNote) => number> = {
    modified: (a, b) => b.modified.localeCompare(a.modified) || b.path.localeCompare(a.path),
    newest: (a, b) => b.created.localeCompare(a.created) || b.path.localeCompare(a.path),
    oldest: (a, b) => a.created.localeCompare(b.created) || a.path.localeCompare(b.path),
    title: (a, b) => (a.title || "\uffff").localeCompare(b.title || "\uffff", undefined, { numeric: true, sensitivity: "base" }),
  };
  return [...list].sort((a, b) => Number(b.pinned) - Number(a.pinned) || cmp[by](a, b));
}

/** Every tag in use with how many notes have it, most used first. */
export function noteTags(list: FullNote[]): { tag: string; count: number }[] {
  const n = new Map<string, number>();
  for (const x of list) for (const g of x.tags) n.set(g, (n.get(g) ?? 0) + 1);
  return [...n].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/** A line as plain words: no Markdown marks, HTML tags, formulas' $, comments or [[ ]]. */
function plainLine(l: string): string {
  return l
    .replace(MARKS, "")
    .replace(/^\[![\w-]+\][+-]?\s*/, "")
    .replace(/%%.*?%%/g, "")
    .replace(/<\/?[a-z]+\s*\/?>/gi, "")
    .replace(/!?\[\[([^\]|]*\|)?([^\]]*)\]\]/g, "$2")
    .replace(/\[\^[^\]]+\]/g, "")
    .replace(/[*_~`=$]/g, "")
    .trim();
}

export function toFullNote(n: Note): FullNote {
  const { title, rest } = itemParts(n.body);
  const preview = rest
    .split("\n")
    .map(l => plainLine(l))
    .filter(Boolean)
    .join(" · ")
    .slice(0, 160);
  return {
    path: n.path,
    title,
    preview,
    modified: String(n.data.modified ?? n.data.created ?? ""),
    created: String(n.data.created ?? /(\d{8}-\d{6})/.exec(n.path)?.[1].replace(/^(\d{4})(\d\d)(\d\d)-(\d\d)(\d\d)(\d\d)$/, "$1-$2-$3T$4:$5:$6") ?? ""),
    pinned: n.data.pinned === true,
    tags: tagsOf(n.body),
    folded: fold(`${title}\n${n.body}`).folded,
  };
}

/** Pinned first, then the most recently changed. */
export async function loadFullNotes(notes: Notes, onError?: (path: string) => void): Promise<FullNote[]> {
  const list = (await notes.loadDir("notes", p => onError?.(p))).map(toFullNote);
  return list.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.modified.localeCompare(a.modified) || b.path.localeCompare(a.path));
}

/**
 * Every word of the filter must be in the title or the text (accents and capitals ignored);
 * `tag` keeps the notes with that tag (or a tag under it: "school" also keeps "school/ads").
 */
export function filterNotes(list: FullNote[], query: string, only: { tag?: string; pinned?: boolean } = {}): FullNote[] {
  const words = fold(query).folded.split(/\s+/).filter(Boolean);
  const tag = only.tag;
  return list.filter(
    n =>
      (!words.length || words.every(w => n.folded.includes(w))) &&
      (!only.pinned || n.pinned) &&
      (!tag || n.tags.some(g => g === tag || g.startsWith(`${tag}/`))),
  );
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
