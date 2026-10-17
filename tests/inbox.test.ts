import { describe, expect, it } from "vitest";
import { MemoryStorage } from "../src/storage/memory";
import { Notes } from "../src/data/notes";
import { createInboxItem, inboxToIdea, inboxToTodo, itemParts, loadInbox, routeCapture, undoMove } from "../src/data/inbox";
import { loadTasks } from "../src/data/todo";

const SAT = new Date(2026, 9, 17, 9, 30, 5);

describe("capture rule", () => {
  const table: [string, "todo" | "inbox", string][] = [
    ["Buy milk", "inbox", "Buy milk"],
    ["App idea: a shelf for books", "inbox", "App idea: a shelf for books"],
    ["sun cream", "inbox", "sun cream"],
    ["t Buy milk", "todo", "Buy milk"],
    ["T  call mom", "todo", "call mom"],
    ["Buy milk tomorrow", "todo", "Buy milk"],
    ["Pay rent #home", "todo", "Pay rent"],
    ["Fix the bike !2", "todo", "Fix the bike"],
    ["Call bank at 5pm", "todo", "Call bank"],
    ["Run every monday", "todo", "Run"],
    ["  spaces   inside  ", "inbox", "spaces inside"],
    ["t", "inbox", "t"],
    ["tomorrow", "inbox", "tomorrow"], // nothing left for a title
  ];
  for (const [input, to, text] of table)
    it(`${JSON.stringify(input)} → ${to}`, () => {
      const r = routeCapture(input, SAT);
      expect(r.to).toBe(to);
      expect(r.to === "todo" ? r.task.title : r.text).toBe(text);
    });

  it("Keep as note sends a matched line to the inbox as typed", () => {
    expect(routeCapture("May 5 ideas", SAT).to).toBe("todo");
    expect(routeCapture("May 5 ideas", SAT, true)).toEqual({ to: "inbox", text: "May 5 ideas" });
  });
});

describe("inbox items", () => {
  it("splits the title from the rest", () => {
    expect(itemParts("# Title\n\nmore")).toEqual({ title: "Title", rest: "more" });
    expect(itemParts("first line\nsecond\n")).toEqual({ title: "first line", rest: "second\n" });
    expect(itemParts("\nonly\n")).toEqual({ title: "only", rest: "" });
  });

  it("moves to To-do keeping the created time and the stamp, and undo puts it back", async () => {
    const notes = new Notes(new MemoryStorage());
    const item = await createInboxItem(notes, "Call the dentist", SAT);
    expect(item.path).toBe("inbox/20261017-093005.md");
    const m = await inboxToTodo(notes, item.path);
    expect(m.to.path).toBe("todo/20261017-093005-call-the-dentist.md");
    expect(m.to.data).toMatchObject({ type: "todo", status: "open", created: item.data.created });
    expect(m.to.body).toBe("# Call the dentist\n");
    expect(await notes.exists(item.path)).toBe(false);
    expect((await loadTasks(notes)).map(t => t.title)).toEqual(["Call the dentist"]);

    await undoMove(notes, m);
    expect(await notes.exists(m.to.path)).toBe(false);
    expect((await notes.load(item.path)).text).toBe(item.text);
  });

  it("moves to Ideas as a draft", async () => {
    const notes = new Notes(new MemoryStorage());
    const item = await createInboxItem(notes, "", SAT);
    await notes.save(item, item.data, "# Book shelf app\n\nCovers and quotes.\n");
    const m = await inboxToIdea(notes, item.path, SAT);
    expect(m.to.path).toBe("ideas/20261017-book-shelf-app.md");
    expect(m.to.data).toMatchObject({ type: "idea", status: "draft", template: "blank", last_seen: "2026-10-17" });
    expect(m.to.body).toBe("# Book shelf app\n\nCovers and quotes.\n");
    expect(await loadInbox(notes)).toEqual([]);
  });

  it("refuses to move an item changed outside the app since it was loaded", async () => {
    const s = new MemoryStorage();
    const notes = new Notes(s);
    const item = await createInboxItem(notes, "x", SAT);
    await s.write(item.path, item.text + "edited elsewhere\n");
    await expect(notes.relocate(item, "todo/x.md", { type: "todo" }, "# x\n")).rejects.toThrow(/changed outside/);
  });
});
