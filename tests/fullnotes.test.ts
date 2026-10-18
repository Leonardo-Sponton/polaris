import { describe, expect, it } from "vitest";
import { MemoryStorage } from "../src/storage/memory";
import { Notes } from "../src/data/notes";
import { createInboxItem, undoMove } from "../src/data/inbox";
import { createFullNote, filterNotes, inboxToNote, loadFullNotes, setPinned, toFullNote } from "../src/data/fullnotes";

const AT = new Date(2026, 9, 18, 21, 52, 7);

describe("notes", () => {
  it("is named by its creation time and starts empty", async () => {
    const notes = new Notes(new MemoryStorage());
    const n = await createFullNote(notes, "", AT);
    expect(n.path).toBe("notes/20261018-215207.md");
    expect(n.data.type).toBe("note");
    expect((await createFullNote(notes, "", AT)).path).toBe("notes/20261018-215207-2.md");
  });

  it("takes the title from the heading and a plain preview from the rest", async () => {
    const notes = new Notes(new MemoryStorage());
    const n = await createFullNote(notes, "# Trip plan\n\n## Days\n- **Day 1:** museum\n- [ ] book the bus\n", AT);
    const f = toFullNote(n);
    expect(f.title).toBe("Trip plan");
    expect(f.preview).toBe("Days · Day 1: museum · book the bus");
    expect(toFullNote(await createFullNote(notes, "first line\nsecond\n", AT)).title).toBe("first line");
  });

  it("lists pinned notes first, then the newest", async () => {
    const notes = new Notes(new MemoryStorage());
    const a = await createFullNote(notes, "# A\n", AT);
    const b = await createFullNote(notes, "# B\n", AT);
    await notes.save(b, { ...b.data, modified: "2026-10-19T08:00" }, b.body, { touch: false });
    await notes.save(a, { ...a.data, modified: "2026-10-18T08:00" }, a.body, { touch: false });
    expect((await loadFullNotes(notes)).map(n => n.title)).toEqual(["B", "A"]);
    await setPinned(notes, a.path, true);
    const list = await loadFullNotes(notes);
    expect(list.map(n => [n.title, n.pinned])).toEqual([["A", true], ["B", false]]);
    await setPinned(notes, a.path, false);
    expect((await notes.load(a.path)).data.pinned).toBeUndefined();
  });

  it("filters by every word, ignoring accents and capitals", async () => {
    const notes = new Notes(new MemoryStorage());
    await createFullNote(notes, "# Receita de feijão\n\nCozinhar na pressão.\n", AT);
    await createFullNote(notes, "# Shopping\n\nbeans\n", AT);
    const list = await loadFullNotes(notes);
    expect(filterNotes(list, "FEIJAO pressao").map(n => n.title)).toEqual(["Receita de feijão"]);
    expect(filterNotes(list, "  ")).toHaveLength(2);
    expect(filterNotes(list, "feijão beans")).toHaveLength(0);
  });

  it("turns an inbox item into a note, with undo", async () => {
    const notes = new Notes(new MemoryStorage());
    const item = await createInboxItem(notes, "Long thought about work", AT);
    const m = await inboxToNote(notes, item.path);
    expect(m.to.path).toBe("notes/20261018-215207.md");
    expect(m.to.data.type).toBe("note");
    expect(m.to.data.created).toBe(item.data.created);
    expect(m.to.body).toBe("Long thought about work\n");
    expect(await notes.exists(item.path)).toBe(false);
    await undoMove(notes, m);
    expect(await notes.exists(item.path)).toBe(true);
    expect(await loadFullNotes(notes)).toHaveLength(0);
  });
});

import { noteTags, sortNotes, tagsOf } from "../src/data/fullnotes";

describe("notes filter", () => {
  it("finds #tags outside code and headings", () => {
    expect(tagsOf("# Title\nTrip #Travel and #school/ads, not a#b\n`#code`\n```\n#inside\n```\n- #todo")).toEqual(["school/ads", "todo", "travel"]);
  });

  it("orders, keeps pinned on top and filters by tag or pinned", async () => {
    const notes = new Notes(new MemoryStorage());
    const a = toFullNote(await createFullNote(notes, "# Banana\n#food\n", new Date(2026, 9, 1)));
    const b = toFullNote(await createFullNote(notes, "# apple\n#food #school/ads\n", new Date(2026, 9, 2)));
    const c = { ...toFullNote(await createFullNote(notes, "# Cherry\n#school\n", new Date(2026, 9, 3))), pinned: true };
    const list = [a, b, c];
    expect(sortNotes(list, "oldest").map(n => n.title)).toEqual(["Cherry", "Banana", "apple"]);
    expect(sortNotes(list, "newest").map(n => n.title)).toEqual(["Cherry", "apple", "Banana"]);
    expect(sortNotes(list, "title").map(n => n.title)).toEqual(["Cherry", "apple", "Banana"]);
    expect(filterNotes(list, "", { tag: "school" }).map(n => n.title)).toEqual(["apple", "Cherry"]);
    expect(filterNotes(list, "", { pinned: true }).map(n => n.title)).toEqual(["Cherry"]);
    expect(noteTags(list)).toEqual([{ tag: "food", count: 2 }, { tag: "school", count: 1 }, { tag: "school/ads", count: 1 }]);
  });
});
