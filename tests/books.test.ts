import { describe, expect, it } from "vitest";
import { MemoryStorage } from "../src/storage/memory";
import { Notes } from "../src/data/notes";
import { createBook, loadBooks, matches, removeCover, statusPatch, toBook, writeCover } from "../src/data/books";
import { listTrash, moveToTrash, restore } from "../src/data/trash";

describe("books", () => {
  it("creates a folder per book with the info in the header", async () => {
    const notes = new Notes(new MemoryStorage());
    const n = await createBook(notes, { title: "Letters from a Stoic", author: "Seneca", status: "reading" }, "2026-10-01");
    expect(n.path).toBe("books/letters-from-a-stoic/book.md");
    expect(n.data).toMatchObject({ type: "book", title: "Letters from a Stoic", author: "Seneca", status: "reading", started: "2026-10-01" });
    expect("finished" in n.data).toBe(false);
    const again = await createBook(notes, { title: "Letters from a Stoic" });
    expect(again.path).toBe("books/letters-from-a-stoic-2/book.md");
    expect(again.data.status).toBe("want");
  });

  it("reads hand-written headers safely", async () => {
    const s = new MemoryStorage();
    await s.write("books/x/book.md", "---\ntype: book\ntitle: 1984\nyear: 1949\npages: 328\nrating: 9\nstatus: odd\ncover: ../y.jpg\n---\nnotes\n");
    await s.write("books/empty/readme.txt", "no book.md here");
    const [b] = await loadBooks(new Notes(s));
    expect(b).toMatchObject({ title: "1984", year: "1949", pages: 328, rating: null, status: "want", format: "paper", cover: undefined });
    expect(b.dir).toBe("books/x");
  });

  it("status changes fill the dates once and keep the DNF reason only for DNF", () => {
    const d = { started: "2026-09-01" };
    expect(statusPatch(d, "read", { today: "2026-10-17" })).toEqual({ status: "read", dnf_reason: undefined, finished: "2026-10-17" });
    expect(statusPatch({}, "dnf", { reason: " Too slow ", today: "2026-10-17" })).toEqual({
      status: "dnf",
      dnf_reason: "Too slow",
      started: "2026-10-17",
    });
    expect(statusPatch({}, "want", { reason: "x" })).toEqual({ status: "want", dnf_reason: undefined });
  });

  it("keeps a single cover file", async () => {
    const s = new MemoryStorage();
    await s.write("books/x/book.md", "---\ntype: book\ntitle: X\n---\n");
    await s.writeBinary("books/x/cover.png", new Uint8Array([1]));
    expect(await writeCover(s, "books/x", new Uint8Array([2, 3]))).toEqual({ cover: "cover.jpg" });
    expect(await s.stat("books/x/cover.png")).toBeNull();
    expect([...(await s.readBinary("books/x/cover.jpg"))]).toEqual([2, 3]);
    expect(await removeCover(s, "books/x")).toEqual({ cover: undefined });
    expect(await s.stat("books/x/cover.jpg")).toBeNull();
  });

  it("finds by title or author without accents", async () => {
    const notes = new Notes(new MemoryStorage());
    const b = toBook(await createBook(notes, { title: "Memórias Póstumas", author: "Machado de Assis" }));
    expect(matches(b, "memorias machado")).toBe(true);
    expect(matches(b, "assis brás")).toBe(false);
  });

  it("a deleted book folder is one trash item and comes back whole", async () => {
    const s = new MemoryStorage();
    await s.write("books/x/book.md", "---\ntype: book\ntitle: X\n---\n");
    await s.writeBinary("books/x/cover.jpg", new Uint8Array([1]));
    await s.write("todo/a.md", "A");
    await moveToTrash(s, "books/x");
    await moveToTrash(s, "todo/a.md");
    const list = await listTrash(s);
    expect(list.map(t => t.from).sort()).toEqual(["books/x", "todo/a.md"]);
    expect(await restore(s, list.find(t => t.from === "books/x")!)).toBe("books/x");
    expect(await s.stat("books/x/cover.jpg")).not.toBeNull();
  });
});
