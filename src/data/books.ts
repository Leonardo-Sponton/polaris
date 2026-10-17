import type { Storage } from "../storage/types";
import { isoDate, slugify } from "./dates";
import type { Data } from "./frontmatter";
import type { Note, Notes } from "./notes";

// Books (SPEC 5.6): one folder per book, books/<slug>/book.md with the book's info in the header
// and free notes in the body, plus an optional cover image next to it. Title and author live in
// the header (SPEC 3.3), not in a "# Title" line.

export type BookStatus = "reading" | "want" | "read" | "dnf" | "wishlist";
export type Format = "paper" | "ebook" | "audio";

/** In the order of the shelf tabs. */
export const STATUSES: { id: BookStatus; label: string }[] = [
  { id: "reading", label: "Reading" },
  { id: "want", label: "Want to read" },
  { id: "read", label: "Read" },
  { id: "dnf", label: "Did not finish" },
  { id: "wishlist", label: "Wishlist" },
];

export const FORMATS: { id: Format; label: string }[] = [
  { id: "paper", label: "Paper" },
  { id: "ebook", label: "E-book" },
  { id: "audio", label: "Audiobook" },
];

export const BOOK_FILE = "book.md";
export const COVER_NAMES = ["cover.jpg", "cover.jpeg", "cover.png", "cover.webp"];

export interface Book {
  /** books/<slug>/book.md */
  path: string;
  /** books/<slug> */
  dir: string;
  note: Note;
  title: string;
  author: string;
  year: string;
  publisher: string;
  pages: number | null;
  isbn: string;
  /** Where to buy it (a web link, for wishlist books). */
  buyUrl: string;
  format: Format;
  status: BookStatus;
  dnfReason: string;
  started: string;
  finished: string;
  /** 1–5, or null when not rated. */
  rating: number | null;
  /** Path of the cover image, or undefined. */
  cover?: string;
  created: string;
  modified: string;
}

const str = (v: unknown) => (v === undefined || v === null ? "" : String(v));
const pick = <T extends string>(value: unknown, list: { id: T }[], fallback: T): T =>
  list.some(x => x.id === value) ? (value as T) : fallback;

function int(v: unknown, min: number, max: number): number | null {
  const n = typeof v === "number" ? v : parseInt(str(v), 10);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

export const dirOf = (path: string) => path.slice(0, path.lastIndexOf("/"));

export function toBook(note: Note): Book {
  const d = note.data;
  const dir = dirOf(note.path);
  const cover = str(d.cover);
  return {
    path: note.path,
    dir,
    note,
    title: str(d.title),
    author: str(d.author),
    year: str(d.year),
    publisher: str(d.publisher),
    pages: int(d.pages, 1, 100000),
    isbn: str(d.isbn),
    buyUrl: str(d.buy_url),
    format: pick(d.format, FORMATS, "paper"),
    status: pick(d.status, STATUSES, "want"),
    dnfReason: str(d.dnf_reason),
    started: str(d.started).slice(0, 10),
    finished: str(d.finished).slice(0, 10),
    rating: int(d.rating, 1, 5),
    // Only a plain file name in the book's own folder.
    cover: cover && !cover.includes("/") ? `${dir}/${cover}` : undefined,
    created: str(d.created),
    modified: str(d.modified ?? d.created),
  };
}

/** Every book, last changed first. A folder without book.md is skipped. */
export async function loadBooks(notes: Notes, onError?: (path: string) => void): Promise<Book[]> {
  const out: Book[] = [];
  for (const f of await notes.storage.list("books")) {
    if (!f.isDir) continue;
    const path = `books/${f.name}/${BOOK_FILE}`;
    if (!(await notes.exists(path))) continue;
    try {
      out.push(toBook(await notes.load(path)));
    } catch {
      onError?.(path);
    }
  }
  return out.sort((a, b) => b.modified.localeCompare(a.modified) || a.path.localeCompare(b.path));
}

export async function createBook(notes: Notes, fields: { title: string; author?: string; status?: BookStatus }, today = isoDate()) {
  const dir = await notes.freePath("books", slugify(fields.title), "");
  const status = fields.status ?? "want";
  const data: Data = {
    type: "book",
    title: fields.title.trim(),
    author: fields.author?.trim() || undefined,
    format: "paper",
    status,
    ...datesFor(status, {}, today),
  };
  return notes.create(`${dir}/${BOOK_FILE}`, data, "");
}

/** Start and finish dates filled in when the status says the book was started or finished. */
function datesFor(status: BookStatus, d: Data, today: string): Data {
  const out: Data = {};
  if ((status === "reading" || status === "read" || status === "dnf") && !d.started) out.started = today;
  if (status === "read" && !d.finished) out.finished = today;
  return out;
}

/**
 * Header changes for a new status. Starting to read sets `started`, finishing sets `finished`
 * (only when empty, so dates typed by hand stay). Did-not-finish keeps an optional reason;
 * any other status drops it.
 */
export function statusPatch(d: Data, status: BookStatus, opts: { reason?: string; today?: string } = {}): Data {
  return {
    status,
    dnf_reason: status === "dnf" && opts.reason?.trim() ? opts.reason.trim() : undefined,
    ...datesFor(status, d, opts.today ?? isoDate()),
  };
}

/**
 * The web link to open for a typed or pasted buy link, or null when it is not one. A link pasted
 * without "https://" (e.g. "amazon.com.br/dp/…") gets it added.
 */
export function webLink(text: string): string | null {
  const t = text.trim();
  if (!t || /\s/.test(t)) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`;
  try {
    const u = new URL(withScheme);
    return (u.protocol === "https:" || u.protocol === "http:") && u.hostname.includes(".") ? u.href : null;
  } catch {
    return null;
  }
}

/** Matches a search on title and author, ignoring accents and case. */
export function matches(b: Book, query: string): boolean {
  const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const hay = fold(`${b.title} ${b.author}`);
  return fold(query).split(/\s+/).filter(Boolean).every(w => hay.includes(w));
}

/**
 * Saves a cover image next to book.md and returns the header change. Other cover files of the
 * book are removed, so there is only ever one.
 */
export async function writeCover(s: Storage, dir: string, bytes: Uint8Array, ext = "jpg"): Promise<Data> {
  const name = `cover.${ext}`;
  await s.writeBinary(`${dir}/${name}`, bytes);
  for (const other of COVER_NAMES) if (other !== name && (await s.stat(`${dir}/${other}`))) await s.remove(`${dir}/${other}`);
  return { cover: name };
}

export async function removeCover(s: Storage, dir: string): Promise<Data> {
  for (const name of COVER_NAMES) if (await s.stat(`${dir}/${name}`)) await s.remove(`${dir}/${name}`);
  return { cover: undefined };
}
