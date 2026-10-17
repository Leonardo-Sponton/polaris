import { describe, expect, it } from "vitest";
import { MemoryStorage } from "../src/storage/memory";
import { Notes } from "../src/data/notes";
import { createBook, loadBooks } from "../src/data/books";
import {
  bookPathOf,
  createQuote,
  isQuotePath,
  joinQuote,
  loadQuotes,
  markReviewed,
  reviewQueue,
  setLastReviewed,
  splitQuote,
  toQuote,
  type Quote,
} from "../src/data/quotes";

const q = (path: string, data: Record<string, unknown>, body = "> text"): Quote =>
  toQuote({ path, data, body, text: "", doc: null as never });

describe("quotes", () => {
  it("splits the first blockquote from the comment and joins them back", () => {
    const body = "\n> All things are not ours;\n>\n> time alone is ours.\n\nMy comment\n\nmore";
    expect(splitQuote(body)).toEqual({ text: "All things are not ours;\n\ntime alone is ours.", comment: "My comment\n\nmore" });
    expect(joinQuote("All things are not ours;\n\ntime alone is ours.", "My comment\n\nmore")).toBe(
      "> All things are not ours;\n>\n> time alone is ours.\n\nMy comment\n\nmore",
    );
    expect(splitQuote("Just a comment")).toEqual({ text: "", comment: "Just a comment" });
    expect(joinQuote("", "Just a comment")).toBe("Just a comment");
    expect(joinQuote("Only the quote", "")).toBe("> Only the quote");
  });

  it("creates quotes in the book folder and lists them by page", async () => {
    const notes = new Notes(new MemoryStorage());
    const book = await createBook(notes, { title: "Letters from a Stoic" });
    const dir = "books/letters-from-a-stoic";
    const t = new Date(2026, 9, 17, 10, 0, 0);
    const a = await createQuote(notes, dir, { page: 42 }, t);
    const b = await createQuote(notes, dir, {}, t);
    const c = await createQuote(notes, dir, { page: 7 }, new Date(2026, 9, 17, 11, 0, 0));
    expect(a.path).toBe(`${dir}/quotes/20261017-100000.md`);
    expect(b.path).toBe(`${dir}/quotes/20261017-100000-2.md`);
    expect(isQuotePath(a.path)).toBe(true);
    expect(isQuotePath(book.path)).toBe(false);
    expect(bookPathOf(a.path)).toBe(book.path);
    const list = await loadQuotes(notes, await loadBooks(notes));
    expect(list.map(x => x.path)).toEqual([c.path, a.path, b.path]);
    expect(list[0].bookTitle).toBe("Letters from a Stoic");
  });

  it("reviews 3 a day, longest ago first, never reviewed before all", () => {
    const today = "2026-10-17";
    const list = [
      q("a", { created: "2026-01-01T10:00", last_reviewed: "2026-10-10" }),
      q("b", { created: "2026-02-01T10:00" }),
      q("c", { created: "2026-01-15T10:00" }),
      q("d", { created: "2026-03-01T10:00", last_reviewed: "2026-09-01" }),
      q("e", { created: "2026-03-01T10:00" }, "only a comment"),
    ];
    expect(reviewQueue(list, today).map(x => x.path)).toEqual(["c", "b", "d"]);
    list[2] = q("c", { created: "2026-01-15T10:00", last_reviewed: today });
    expect(reviewQueue(list, today).map(x => x.path)).toEqual(["b", "d"]);
    list[1] = q("b", { last_reviewed: today });
    list[3] = q("d", { last_reviewed: today });
    expect(reviewQueue(list, today)).toEqual([]);
  });

  it("marks reviewed without changing `modified`, and gives the old value back", async () => {
    const notes = new Notes(new MemoryStorage());
    await createBook(notes, { title: "X" });
    const n = await createQuote(notes, "books/x");
    const old = await markReviewed(notes, n.path, "2026-10-17");
    expect(old).toEqual({ last_reviewed: undefined });
    const after = await notes.load(n.path);
    expect(after.data.last_reviewed).toBe("2026-10-17");
    expect(after.data.modified).toBe(n.data.modified);
    await setLastReviewed(notes, n.path, old.last_reviewed);
    expect((await notes.load(n.path)).data).not.toHaveProperty("last_reviewed");
  });
});
