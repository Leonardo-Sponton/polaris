import { addDays, isoDate, parseLocal } from "./dates";
import { isWord, word, type Words } from "../i18n";
import type { Data } from "./frontmatter";
import type { Note, Notes } from "./notes";

// Journal (SPEC 5.7): one file per day, journal/YYYY-MM-DD.md, only written when the day has
// something. Header: `mood`. Body: free text, then the optional "## " sections.
// Close the day (SPEC 5.9) also writes one section of the evening review (review/YYYY-MM-DD.md).

export type Mood = "hard" | "tiring" | "hectic" | "normal" | "calm" | "good";

/** "The day was…": words, not a score (as MyNotes). `color` is a theme variable. */
export const MOODS: { id: Mood; color: string }[] = [
  { id: "hard", color: "h1" },
  { id: "tiring", color: "h2" },
  { id: "hectic", color: "h3" },
  { id: "normal", color: "muted" },
  { id: "calm", color: "cyan" },
  { id: "good", color: "ok" },
];

/** Where Close the day puts what was learned. */
export const LEARNINGS: Words = { en: "Learnings", pt: "Aprendizados" };

/** Optional sections, added by buttons; nothing is required. Written in the app's language. */
export const JOURNAL_SECTIONS: Words[] = [
  { en: "Important events", pt: "Acontecimentos importantes" },
  LEARNINGS,
  { en: "Personal notes", pt: "Notas pessoais" },
];

/** Where Close the day puts the intentions (SPEC 5.8, 5.9). */
export const INTENTIONS: Words = { en: "Intentions for tomorrow", pt: "Intenções para amanhã" };

export const journalPath = (day: string) => `journal/${day}.md`;
export const reviewPath = (day: string) => `review/${day}.md`;

/** The day of a journal or review path, or null. */
export function dayOfPath(path: string): string | null {
  const m = /^(?:journal|review)\/(\d{4}-\d{2}-\d{2})\.md$/.exec(path);
  return m && parseLocal(m[1]) ? m[1] : null;
}

export const shiftDay = (day: string, n: number) => isoDate(addDays(parseLocal(day) ?? new Date(), n));

export interface Entry {
  day: string;
  path: string;
  mood?: Mood;
  /** First line of text, without Markdown symbols. */
  preview: string;
  body: string;
}

const moodOf = (v: unknown): Mood | undefined => MOODS.find(m => m.id === v)?.id;

/** Nothing written and no mood: the day counts as empty (its file is not kept). */
export const isEmptyDay = (body: string, data: Data) => body.trim() === "" && !moodOf(data.mood);

export function toEntry(note: Note): Entry {
  const day = dayOfPath(note.path)!;
  const line =
    note.body
      .split("\n")
      .map(l => l.trim())
      .find(l => l && !/^##\s/.test(l)) ?? "";
  return {
    day,
    path: note.path,
    mood: moodOf(note.data.mood),
    preview: line.replace(/^(#+|>|[-*+]( \[[ xX]\])?|\d+\.)\s*/, "").replace(/[*_~`]/g, ""),
    body: note.body,
  };
}

/** Every written day, newest first. Empty files (app closed before cleaning up) are left out. */
export async function loadJournal(notes: Notes, onError?: (path: string) => void): Promise<Entry[]> {
  const list = await notes.loadDir("journal", p => onError?.(p));
  return list
    .filter(n => dayOfPath(n.path) && !isEmptyDay(n.body, n.data))
    .map(toEntry)
    .sort((a, b) => b.day.localeCompare(a.day));
}

/** The day's file, created when missing. */
export async function openDay(notes: Notes, kind: "journal" | "review", day: string): Promise<Note> {
  const path = kind === "journal" ? journalPath(day) : reviewPath(day);
  if (await notes.exists(path)) return notes.load(path);
  return notes.create(path, { type: kind }, "");
}

/** The "## " headings of a body with the line where each starts. */
function headings(lines: string[]) {
  const out: { name: string; at: number }[] = [];
  lines.forEach((l, at) => {
    const m = /^##[ \t]+(.+?)[ \t]*#*[ \t]*$/.exec(l);
    if (m) out.push({ name: m[1].trim().toLowerCase(), at });
  });
  return out;
}

/**
 * Adds `text` at the end of the section "## name" (created at the end when missing), or, with
 * name null, at the end of the free text before the first section. Nothing else is changed.
 * A name in both languages finds the section in either and creates it in the app's language.
 */
export function appendTo(body: string, name: string | Words | null, text: string): string {
  const add = text.trim();
  if (!add) return body;
  const lines = body.replace(/\s+$/, "").split("\n");
  if (lines.length === 1 && lines[0] === "") lines.length = 0;
  const hs = headings(lines);
  let start: number; // first line of the part
  let end: number; // line after the part
  if (name === null) {
    start = 0;
    end = hs.length ? hs[0].at : lines.length;
  } else {
    const i = hs.findIndex(h => (typeof name === "string" ? h.name === name.toLowerCase() : isWord(name, h.name)));
    if (i < 0) {
      const base = lines.join("\n");
      return `${base}${base ? "\n\n" : ""}## ${typeof name === "string" ? name : word(name)}\n\n${add}\n`;
    }
    start = hs[i].at + 1;
    end = i + 1 < hs.length ? hs[i + 1].at : lines.length;
  }
  const part = lines.slice(start, end).join("\n").trim();
  const before = lines.slice(0, start).join("\n").replace(/\s+$/, "");
  const after = lines.slice(end).join("\n");
  const mid = part ? `${part}\n\n${add}` : add;
  const head = name === null ? "" : `${before}\n\n`;
  return `${head}${mid}${after ? `\n\n${after}` : ""}\n`;
}

export interface Closing {
  /** How was the day? → end of the journal's free text. */
  how: string;
  /** What did I learn…? → journal "Learnings". */
  learned: string;
  /** Intentions for tomorrow → review "Intentions for tomorrow". */
  intentions: string;
}

/**
 * Close the day (SPEC 5.9): each answer goes to one place only; empty answers are skipped.
 * Returns the files written. A file changed meanwhile by its open screen raises ConflictError
 * (callers save open screens first).
 */
export async function closeDay(notes: Notes, day: string, c: Closing): Promise<string[]> {
  const written: string[] = [];
  const write = async (kind: "journal" | "review", parts: [Words | null, string][]) => {
    if (!parts.some(([, t]) => t.trim())) return;
    const n = await openDay(notes, kind, day);
    let body = n.body;
    for (const [name, t] of parts) body = appendTo(body, name, t);
    await notes.save(n, n.data, body);
    written.push(n.path);
  };
  await write("journal", [
    [null, c.how],
    [LEARNINGS, c.learned],
  ]);
  await write("review", [[INTENTIONS, c.intentions]]);
  return written;
}
