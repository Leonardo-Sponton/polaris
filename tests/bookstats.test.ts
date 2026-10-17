import { describe, expect, it } from "vitest";
import { toBook, type Book } from "../src/data/books";
import { bookStats, daysToFinish, readYears } from "../src/data/bookstats";
import type { Data } from "../src/data/frontmatter";

let n = 0;
const book = (data: Data): Book => toBook({ path: `books/b${++n}/book.md`, data: { type: "book", ...data }, body: "" } as never);

const shelf = [
  book({ status: "read", started: "2026-01-01", finished: "2026-01-10", pages: 200, rating: 4, format: "paper" }),
  book({ status: "read", started: "2026-03-05", finished: "2026-03-05", pages: 100, rating: 2, format: "ebook" }),
  book({ status: "read", finished: "2026-03-20", format: "audio" }),
  book({ status: "read", started: "2024-06-01", finished: "2024-07-01", pages: 300 }),
  book({ status: "read", pages: 50 }), // no finished date
  book({ status: "reading", started: "2026-10-01", pages: 400 }),
  book({ status: "dnf", started: "2026-02-01", finished: "2026-02-03" }),
  book({ status: "wishlist" }),
];

describe("reading stats", () => {
  it("counts both days when finishing", () => {
    expect(daysToFinish(shelf[0])).toBe(10);
    expect(daysToFinish(shelf[1])).toBe(1);
    expect(daysToFinish(shelf[2])).toBeNull();
    expect(daysToFinish(book({ started: "2026-05-02", finished: "2026-05-01" }))).toBeNull();
  });

  it("lists years that have read books, newest first (DNF dates do not count)", () => {
    expect(readYears(shelf)).toEqual([2026, 2024]);
  });

  it("sums a year by month", () => {
    const s = bookStats(shelf, 2026);
    expect(s.read).toEqual({ books: 3, pages: 300 });
    expect(s.noPages).toBe(1);
    expect(s.avgRating).toBe(3);
    expect(s.rated).toBe(2);
    expect(s.avgDays).toBe(5.5);
    expect(s.bars).toHaveLength(12);
    expect(s.bars[0]).toMatchObject({ label: "Jan", books: 1, pages: 200 });
    expect(s.bars[2]).toMatchObject({ label: "Mar", books: 2, pages: 100 });
    expect(s.byFormat.map(f => f.count)).toEqual([1, 1, 1]);
    expect(s.undated).toBe(0);
  });

  it("all time has one bar per year with no gaps, and counts undated reads", () => {
    const s = bookStats(shelf, null);
    expect(s.read).toEqual({ books: 5, pages: 650 });
    expect(s.bars.map(b => [b.label, b.books])).toEqual([
      ["2024", 1],
      ["2025", 0],
      ["2026", 3],
    ]);
    expect(s.undated).toBe(1);
    expect(s.byStatus.map(x => [x.id, x.count])).toEqual([
      ["reading", 1],
      ["want", 0],
      ["read", 5],
      ["dnf", 1],
      ["wishlist", 1],
    ]);
  });

  it("an empty shelf gives empty numbers", () => {
    const s = bookStats([], null);
    expect(s).toMatchObject({ read: { books: 0, pages: 0 }, avgRating: null, avgDays: null, bars: [] });
  });
});
