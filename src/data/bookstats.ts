import { FORMATS, STATUSES, type Book, type BookStatus, type Format } from "./books";
import { t } from "../i18n";
import { parseLocal } from "./dates";

// Reading stats (SPEC 5.6). A book counts as read in the year and month of its `finished` date;
// a read book without that date only counts in "All time". Pages come from the book's `pages`.
// Days to finish count both ends: started and finished on the same day = 1 day.

export interface Tally {
  books: number;
  pages: number;
}

export interface Stats {
  /** The year shown, or null for all time. */
  year: number | null;
  /** Read books in that time, and their pages. */
  read: Tally;
  /** Read books in that time with no page count (their pages are missing from the total). */
  noPages: number;
  /** Average rating of the rated read books, or null when none is rated. */
  avgRating: number | null;
  rated: number;
  /** Average days from start to finish, or null when no read book has both dates. */
  avgDays: number | null;
  timed: number;
  /** Bars: the 12 months of the year, or one per year (oldest first) for all time. */
  bars: (Tally & { label: string; key: string })[];
  /** All time only: read books without a finished date. */
  undated: number;
  /** Read books in that time, by format. */
  byFormat: { id: Format; label: string; count: number }[];
  /** Every book on the shelf now, by status (not tied to a year). */
  byStatus: { id: BookStatus; label: string; count: number }[];
}

const finishedOn = (b: Book) => (b.status === "read" ? parseLocal(b.finished) : null);

/** Days from start to finish, both counted, or null when a date is missing or out of order. */
export function daysToFinish(b: Book): number | null {
  const s = parseLocal(b.started);
  const f = parseLocal(b.finished);
  if (!s || !f || f < s) return null;
  return Math.round((f.getTime() - s.getTime()) / 86400000) + 1;
}

/** Years with at least one book read, newest first. */
export function readYears(books: Book[]): number[] {
  const set = new Set<number>();
  for (const b of books) {
    const f = finishedOn(b);
    if (f) set.add(f.getFullYear());
  }
  return [...set].sort((a, b) => b - a);
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function bookStats(books: Book[], year: number | null): Stats {
  const read = books.filter(b => {
    if (b.status !== "read") return false;
    if (year === null) return true;
    return finishedOn(b)?.getFullYear() === year;
  });
  const tally = (list: Book[]): Tally => ({ books: list.length, pages: list.reduce((n, b) => n + (b.pages ?? 0), 0) });

  let bars: Stats["bars"];
  if (year !== null) {
    bars = t.dates.months.map((label, m) => ({
      label: label[0].toUpperCase() + label.slice(1),
      key: String(m + 1),
      ...tally(read.filter(b => finishedOn(b)!.getMonth() === m)),
    }));
  } else {
    const years = readYears(read).reverse();
    // No gaps hidden: a year with nothing read between two others still gets its (empty) bar.
    const all = years.length ? Array.from({ length: years.at(-1)! - years[0] + 1 }, (_, i) => years[0] + i) : [];
    bars = all.map(y => ({ label: String(y), key: String(y), ...tally(read.filter(b => finishedOn(b)?.getFullYear() === y)) }));
  }

  const ratings = read.flatMap(b => (b.rating ? [b.rating] : []));
  const days = read.flatMap(b => {
    const d = daysToFinish(b);
    return d === null ? [] : [d];
  });

  return {
    year,
    read: tally(read),
    noPages: read.filter(b => b.pages === null).length,
    avgRating: avg(ratings),
    rated: ratings.length,
    avgDays: avg(days),
    timed: days.length,
    bars,
    undated: year === null ? read.filter(b => !finishedOn(b)).length : 0,
    byFormat: FORMATS.map(f => ({ ...f, label: t.books.formats[f.id], count: read.filter(b => b.format === f.id).length })),
    byStatus: STATUSES.map(s => ({ ...s, label: t.books.status[s.id], count: books.filter(b => b.status === s.id).length })),
  };
}
