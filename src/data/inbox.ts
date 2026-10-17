import { isoDate, slugify, stamp } from "./dates";
import type { Note, Notes } from "./notes";
import { parseQuickAdd, type QuickAdd } from "./quickadd";
import { joinTitle, splitTitle } from "./todo";

// Quick capture and the inbox (SPEC 5.2).

export type Capture = { to: "todo"; task: QuickAdd } | { to: "inbox"; text: string };

/**
 * Where a captured line goes. The rule, kept simple so it is predictable:
 * - a line starting with "t " is a to-do;
 * - a line with any quick-add part (a date, time, repeat, #list, !1, evening) is a to-do;
 * - anything else goes to the inbox, exactly as typed.
 * `asNote` forces the inbox (the "Keep as note" button, for a false match like "May 5 ideas").
 */
export function routeCapture(text: string, today: Date = new Date(), asNote = false): Capture {
  const line = text.replace(/\s+/g, " ").trim();
  if (asNote) return { to: "inbox", text: line };
  const forced = /^t\s+/i.exec(line);
  const task = parseQuickAdd(forced ? line.slice(forced[0].length) : line, today);
  if (task.title && (forced || task.spans.length > 0)) return { to: "todo", task };
  return { to: "inbox", text: line };
}

export async function createInboxItem(notes: Notes, text: string, at = new Date()): Promise<Note> {
  return notes.create(await notes.freePath("inbox", stamp(at)), { type: "inbox" }, text ? `${text}\n` : "");
}

/** Title and the rest of an inbox item: its "# " heading, or else its first line. */
export function itemParts(body: string): { title: string; rest: string } {
  const s = splitTitle(body);
  if (s.title) return s;
  const lines = body.replace(/^\s*\n/, "").split("\n");
  const title = (lines.shift() ?? "").trim();
  return { title, rest: lines.join("\n").replace(/^\s*\n/, "") };
}

/** File name stamp of an inbox item (kept when it moves, so the creation order survives). */
const stampOf = (path: string) => /(\d{8}-\d{6})/.exec(path)?.[1] ?? stamp();

export interface Moved {
  from: Note;
  to: Note;
}

/** Inbox item → open to-do in todo/ (same created time, header keys kept). */
export async function inboxToTodo(notes: Notes, path: string): Promise<Moved> {
  const n = await notes.load(path);
  const { title, rest } = itemParts(n.body);
  const name = title || "untitled";
  const to = await notes.freePath("todo", `${stampOf(path)}-${slugify(name)}`);
  const { type: _t, ...keep } = n.data;
  const moved = await notes.relocate(n, to, { type: "todo", status: "open", ...keep }, joinTitle(name, rest));
  return { from: n, to: moved };
}

/** Inbox item → draft idea in ideas/ (SPEC 3.3; the Ideas screen comes in stage 2). */
export async function inboxToIdea(notes: Notes, path: string, now = new Date()): Promise<Moved> {
  const n = await notes.load(path);
  const { title, rest } = itemParts(n.body);
  const name = title || "untitled";
  const to = await notes.freePath("ideas", `${stampOf(path).slice(0, 8)}-${slugify(name)}`);
  const { type: _t, ...keep } = n.data;
  const data = { type: "idea", status: "draft", template: "blank", ...keep, last_seen: isoDate(now) };
  const moved = await notes.relocate(n, to, data, joinTitle(name, rest));
  return { from: n, to: moved };
}

export const undoMove = (notes: Notes, m: Moved) => notes.unrelocate(m.from, m.to);

export async function loadInbox(notes: Notes, onError?: (path: string) => void): Promise<Note[]> {
  const list = await notes.loadDir("inbox", p => onError?.(p));
  return list.sort((a, b) => b.path.localeCompare(a.path));
}
