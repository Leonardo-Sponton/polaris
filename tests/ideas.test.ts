import { describe, expect, it } from "vitest";
import { MemoryStorage } from "../src/storage/memory";
import { Notes } from "../src/data/notes";
import {
  addSection,
  archivePatch,
  createIdea,
  loadIdeas,
  markSeen,
  missingSections,
  parseTags,
  reopenPatch,
  sectionsOf,
} from "../src/data/ideas";
import { createInboxItem, inboxToIdea } from "../src/data/inbox";

const SAT = new Date(2026, 9, 17, 9, 30, 5);

describe("ideas", () => {
  it("creates a draft with just a title", async () => {
    const notes = new Notes(new MemoryStorage());
    const n = await createIdea(notes, "A shelf for books", "software", SAT);
    expect(n.path).toBe("ideas/20261017-a-shelf-for-books.md");
    expect(n.data).toMatchObject({ type: "idea", status: "draft", template: "software", last_seen: "2026-10-17" });
    expect(n.body).toBe("# A shelf for books\n");
    const again = await createIdea(notes, "A shelf for books", "blank", SAT);
    expect(again.path).toBe("ideas/20261017-a-shelf-for-books-2.md");
  });

  it("loads ideas with defaults for missing or odd keys, last changed first", async () => {
    const s = new MemoryStorage();
    await s.write("ideas/a.md", "---\ntype: idea\nmodified: 2026-10-01T10:00\n---\n# Old\n");
    await s.write("ideas/b.md", "---\ntype: idea\nstatus: weird\ntemplate: x\ntags: [app]\nmodified: 2026-10-10T10:00\n---\n# New\n");
    await s.write("ideas/c.md", "---\ntype: todo\n---\n# Not an idea\n");
    const list = await loadIdeas(new Notes(s));
    expect(list.map(i => [i.title, i.status, i.template, i.tags])).toEqual([
      ["New", "draft", "blank", ["app"]],
      ["Old", "draft", "blank", []],
    ]);
  });

  it("an inbox item becomes a draft idea that the list shows", async () => {
    const notes = new Notes(new MemoryStorage());
    const item = await createInboxItem(notes, "App to track books", SAT);
    await inboxToIdea(notes, item.path, SAT);
    const [idea] = await loadIdeas(notes);
    expect(idea).toMatchObject({ title: "App to track books", status: "draft", template: "blank" });
  });

  it("suggests only the sections a non-blank idea does not have yet", () => {
    const body = "# T\n\ndraft\n\n## Problem\nx\n\n## my own\n";
    expect(sectionsOf(body)).toEqual(["Problem", "my own"]);
    expect(missingSections("blank", body)).toEqual([]);
    expect(missingSections("business", body)).toEqual(["For whom", "Solution", "Why now", "Risks"]);
    expect(missingSections("personal", "## problem\n## risks")).toEqual(["For whom", "Solution", "Why now"]);
  });

  it("adds a section at the end", () => {
    expect(addSection("", "Problem")).toBe("## Problem\n\n");
    expect(addSection("draft text\n\n\n", "Risks")).toBe("draft text\n\n## Risks\n\n");
  });

  it("reads tags typed in any way", () => {
    expect(parseTags("App, study  #App #life,")).toEqual(["app", "study", "life"]);
    expect(parseTags("  ")).toEqual([]);
  });

  it("archives with a reason and reopens, keeping the rest of the file", async () => {
    const notes = new Notes(new MemoryStorage());
    let n = await createIdea(notes, "Food truck", "business", SAT);
    n = await notes.save(n, { ...n.data, custom: 1, ...archivePatch("  Too expensive  ") }, n.body + "draft\n");
    expect(n.data).toMatchObject({ status: "archived", archived_reason: "Too expensive", custom: 1 });
    n = await notes.save(n, { ...n.data, ...reopenPatch() }, n.body);
    expect(n.data.status).toBe("maturing");
    expect("archived_reason" in n.data).toBe(false);
    expect(n.body).toBe("# Food truck\ndraft\n");
  });

  it("opening marks the idea as seen without changing `modified`", async () => {
    const notes = new Notes(new MemoryStorage());
    const n = await createIdea(notes, "X", "blank", SAT);
    await markSeen(notes, n.path, "2026-11-01");
    const back = await notes.load(n.path);
    expect(back.data.last_seen).toBe("2026-11-01");
    expect(back.data.modified).toBe(n.data.modified);
  });
});
