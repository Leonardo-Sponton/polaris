import { isoDate, stamp } from "./dates";
import type { Data } from "./frontmatter";
import type { Note, Notes } from "./notes";
import { BOOK_FILE, type Book } from "./books";

// Quote notes (SPEC 3.3, 5.6): one file per quote in books/<slug>/quotes/. The first blockquote
// of the body is the quote, everything after it is the comment. Page, chapter, tags and the
// date of the last daily review live in the header.

export const QUOTES_DIR = "quotes";
/** Quotes shown by the daily review (SPEC 9, point 5). */
export const REVIEW_PER_DAY = 3;

export interface Quote {
  /** books/<slug>/quotes/<stamp>.md */
  path: string;
  /** books/<slug>/book.md */
  bookPath: string;
  bookTitle: string;
  bookAuthor: string;
  note: Note;
  text: string;
  comment: string;
  /** As typed ("42", "xii"…); `pageNumber` is used to sort. */
  page: string;
  pageNumber: number | null;
  chapter: string;
  tags: string[];
  lastReviewed: string;
  created: string;
}

const str = (v: unknown) => (v === undefined || v === null ? "" : String(v));

/** Splits a body into the leading blockquote and the comment after it. */
export function splitQuote(body: string): { text: string; comment: string } {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  let i = 0;
  while (i < lines.length && lines[i].trim() === "") i++;
  const quoted: string[] = [];
  for (; i < lines.length && /^\s*>/.test(lines[i]); i++) quoted.push(lines[i].replace(/^\s*> ?/, ""));
  return { text: quoted.join("\n").trim(), comment: lines.slice(i).join("\n").replace(/^\n+/, "") };
}

/** The body for a quote and its comment (the opposite of splitQuote). */
export function joinQuote(text: string, comment: string): string {
  const t = text.trim();
  const quoted = t ? t.split("\n").map(l => (l.trim() ? `> ${l}` : ">")).join("\n") : "";
  const c = comment.replace(/^\n+/, "");
  return quoted && c.trim() ? `${quoted}\n\n${c}` : quoted || c;
}

export const bookPathOf = (quotePath: string) => quotePath.replace(/\/quotes\/[^/]+$/, `/${BOOK_FILE}`);
export const isQuotePath = (path: string) => /^books\/[^/]+\/quotes\/[^/]+\.md$/.test(path);

export function toQuote(note: Note, book?: Pick<Book, "title" | "author">): Quote {
  const d = note.data;
  const { text, comment } = splitQuote(note.body);
  const page = str(d.page);
  const n = parseInt(page, 10);
  const tags = Array.isArray(d.tags) ? d.tags.map(str).filter(Boolean) : [];
  return {
    path: note.path,
    bookPath: bookPathOf(note.path),
    bookTitle: book?.title ?? "",
    bookAuthor: book?.author ?? "",
    note,
    text,
    comment,
    page,
    pageNumber: Number.isFinite(n) ? n : null,
    chapter: str(d.chapter),
    tags,
    lastReviewed: str(d.last_reviewed).slice(0, 10),
    created: str(d.created),
  };
}

/** By page; quotes without a page go last, in the order they were written. */
export function byPage(a: Quote, b: Quote): number {
  if (a.pageNumber !== b.pageNumber) {
    if (a.pageNumber === null) return 1;
    if (b.pageNumber === null) return -1;
    return a.pageNumber - b.pageNumber;
  }
  return a.created.localeCompare(b.created) || a.path.localeCompare(b.path);
}

/** Every quote of the given books, each book's quotes ordered by page. */
export async function loadQuotes(notes: Notes, books: Book[], onError?: (path: string) => void): Promise<Quote[]> {
  const out: Quote[] = [];
  for (const b of books) {
    const dir = `${b.dir}/${QUOTES_DIR}`;
    if (!(await notes.exists(dir))) continue;
    const list = await notes.loadDir(dir, p => onError?.(p));
    out.push(...list.map(n => toQuote(n, b)).sort(byPage));
  }
  return out;
}

/** A new, empty quote note in the book's folder. */
export async function createQuote(notes: Notes, bookDir: string, fields: { page?: string | number } = {}, now = new Date()) {
  const path = await notes.freePath(`${bookDir}/${QUOTES_DIR}`, stamp(now));
  const data: Data = { type: "quote", page: fields.page === "" ? undefined : fields.page };
  return notes.create(path, data, "");
}

/**
 * The daily review (SPEC 5.6): up to 3 quotes a day, the ones reviewed longest ago first (never
 * reviewed before any other, oldest written first). Quotes marked today count towards the 3, so
 * the card is done for the day after three, and comes back with three more tomorrow.
 */
export function reviewQueue(quotes: Quote[], today = isoDate(), perDay = REVIEW_PER_DAY): Quote[] {
  const done = quotes.filter(q => q.lastReviewed === today).length;
  if (done >= perDay) return [];
  return quotes
    .filter(q => q.text && q.lastReviewed !== today)
    .sort((a, b) => a.lastReviewed.localeCompare(b.lastReviewed) || a.created.localeCompare(b.created) || a.path.localeCompare(b.path))
    .slice(0, perDay - done);
}

/** Marks a quote as reviewed today. Does not touch `modified`. Returns the old value for Undo. */
export async function markReviewed(notes: Notes, path: string, today = isoDate()): Promise<Data> {
  return setLastReviewed(notes, path, today);
}

/** Sets (or with undefined, removes) `last_reviewed`, leaving `modified` alone. */
export async function setLastReviewed(notes: Notes, path: string, value: unknown): Promise<Data> {
  const n = await notes.load(path);
  const old = { last_reviewed: n.data.last_reviewed };
  if (n.data.last_reviewed !== value) await notes.save(n, { ...n.data, last_reviewed: value }, n.body, { touch: false });
  return old;
}
