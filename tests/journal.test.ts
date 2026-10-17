import { describe, expect, it } from "vitest";
import { MemoryStorage } from "../src/storage/memory";
import { Notes } from "../src/data/notes";
import { appendTo, closeDay, dayOfPath, isEmptyDay, loadJournal, openDay, shiftDay, toEntry } from "../src/data/journal";

describe("journal", () => {
  it("reads the day from the path", () => {
    expect(dayOfPath("journal/2026-10-17.md")).toBe("2026-10-17");
    expect(dayOfPath("review/2026-10-17.md")).toBe("2026-10-17");
    expect(dayOfPath("journal/2026-02-30.md")).toBeNull();
    expect(dayOfPath("journal/notes.md")).toBeNull();
    expect(shiftDay("2026-10-31", 1)).toBe("2026-11-01");
    expect(shiftDay("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("an empty day has no text and no mood", () => {
    expect(isEmptyDay("  \n", {})).toBe(true);
    expect(isEmptyDay("", { mood: "calm" })).toBe(false);
    expect(isEmptyDay("", { mood: "weird" })).toBe(true);
    expect(isEmptyDay("x", {})).toBe(false);
  });

  it("lists written days newest first, skipping empty files and other names", async () => {
    const s = new MemoryStorage();
    await s.write("journal/2026-10-15.md", "---\ntype: journal\nmood: good\n---\n## Learnings\n\nPatience.\n");
    await s.write("journal/2026-10-16.md", "---\ntype: journal\n---\n");
    await s.write("journal/2026-10-17.md", "---\ntype: journal\nmood: odd\n---\n**Long** day at work.\n");
    await s.write("journal/readme.md", "x");
    const list = await loadJournal(new Notes(s));
    expect(list.map(e => e.day)).toEqual(["2026-10-17", "2026-10-15"]);
    expect(list[0]).toMatchObject({ mood: undefined, preview: "Long day at work." });
    expect(list[1]).toMatchObject({ mood: "good", preview: "Patience." });
  });

  it("appends to the free text, before the sections", () => {
    expect(appendTo("", null, "Calm day.")).toBe("Calm day.\n");
    expect(appendTo("Morning run.\n\n## Learnings\n\nX\n", null, "Calm day.")).toBe(
      "Morning run.\n\nCalm day.\n\n## Learnings\n\nX\n",
    );
    expect(appendTo("## Personal notes\n\nY\n", null, "Calm day.")).toBe("Calm day.\n\n## Personal notes\n\nY\n");
    expect(appendTo("Text", null, "  ")).toBe("Text");
  });

  it("appends to a section, creating it at the end when missing", () => {
    expect(appendTo("Text\n", "Learnings", "Ask early.")).toBe("Text\n\n## Learnings\n\nAsk early.\n");
    expect(appendTo("", "Learnings", "Ask early.")).toBe("## Learnings\n\nAsk early.\n");
    const body = "Text\n\n## learnings\n\nOne.\n\n## Personal notes\n\nZ\n";
    expect(appendTo(body, "Learnings", "Two.")).toBe("Text\n\n## learnings\n\nOne.\n\nTwo.\n\n## Personal notes\n\nZ\n");
    expect(appendTo("## Learnings\n", "Learnings", "One.")).toBe("## Learnings\n\nOne.\n");
  });

  it("close the day writes each answer to one place and skips empty ones", async () => {
    const s = new MemoryStorage();
    const notes = new Notes(s);
    await s.write("journal/2026-10-17.md", "---\ntype: journal\nmood: calm\n---\nMorning run.\n");
    const written = await closeDay(notes, "2026-10-17", {
      how: "Quiet evening.",
      learned: "Rest helps.",
      intentions: "Sleep before midnight.",
    });
    expect(written).toEqual(["journal/2026-10-17.md", "review/2026-10-17.md"]);
    const j = await notes.load("journal/2026-10-17.md");
    expect(j.data.mood).toBe("calm");
    expect(j.body).toBe("Morning run.\n\nQuiet evening.\n\n## Learnings\n\nRest helps.\n");
    const r = await notes.load("review/2026-10-17.md");
    expect(r.data.type).toBe("review");
    expect(r.body).toBe("## Intentions for tomorrow\n\nSleep before midnight.\n");

    expect(await closeDay(notes, "2026-10-18", { how: " ", learned: "", intentions: "" })).toEqual([]);
    expect(await notes.exists("journal/2026-10-18.md")).toBe(false);
    expect(await closeDay(notes, "2026-10-18", { how: "", learned: "", intentions: "Walk." })).toEqual([
      "review/2026-10-18.md",
    ]);
    expect(await notes.exists("journal/2026-10-18.md")).toBe(false);
  });

  it("opens an existing day or creates it", async () => {
    const notes = new Notes(new MemoryStorage());
    const a = await openDay(notes, "journal", "2026-10-17");
    expect(a.data.type).toBe("journal");
    expect(toEntry(a).day).toBe("2026-10-17");
    const b = await openDay(notes, "journal", "2026-10-17");
    expect(b.text).toBe(a.text);
  });
});
