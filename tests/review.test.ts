import { describe, expect, it } from "vitest";
import { MemoryStorage } from "../src/storage/memory";
import { Notes } from "../src/data/notes";
import { closeDay } from "../src/data/journal";
import { BUILTIN } from "../src/data/thoughts";
import { QUESTIONS, isEmptyReview, joinReview, loadReviews, splitReview, virtuesOf } from "../src/data/review";

describe("review", () => {
  it("splits the body by question and writes it back in order, without empty sections", () => {
    const body = "Loose line.\n\n## Repair\n\nCall Ana.\n\n## gratitude\n\nSun.\n\n## Old question\n\nKept.\n\n## Up to me\n\n";
    const p = splitReview(body);
    expect(p.free).toBe("Loose line.");
    expect(p.answers).toEqual({ Repair: "Call Ana.", Gratitude: "Sun.", "Up to me": "" });
    expect(p.extras).toEqual([{ title: "Old question", text: "Kept." }]);
    expect(joinReview(p)).toBe("Loose line.\n\n## Gratitude\n\nSun.\n\n## Repair\n\nCall Ana.\n\n## Old question\n\nKept.\n");
    expect(joinReview(splitReview(""))).toBe("");
  });

  it("joins a repeated section instead of losing it", () => {
    expect(splitReview("## Gratitude\n\nA\n\n## Gratitude\n\nB\n").answers.Gratitude).toBe("A\n\nB");
  });

  it("keeps known virtues in a fixed order", () => {
    expect(virtuesOf(["Temperance", "wisdom", "kindness"])).toEqual(["wisdom", "temperance"]);
    expect(virtuesOf("wisdom")).toEqual([]);
  });

  it("an empty review has no text and no virtue; a picked thought alone does not count", () => {
    expect(isEmptyReview("", { thought: "ept-man-1" })).toBe(true);
    expect(isEmptyReview("", { develop: ["courage"] })).toBe(false);
    expect(isEmptyReview("## Gratitude\n\nX\n", {})).toBe(false);
  });

  it("lists written reviews newest first with how many questions were answered", async () => {
    const s = new MemoryStorage();
    await s.write("review/2026-10-15.md", "---\ntype: review\nvirtues: [justice]\n---\n");
    await s.write("review/2026-10-16.md", "---\ntype: review\n---\n");
    await s.write("review/2026-10-17.md", "---\ntype: review\n---\n## Done well\n\n**Finished** the report.\n\n## Repair\n\nSay sorry.\n");
    const list = await loadReviews(new Notes(s));
    expect(list.map(e => e.day)).toEqual(["2026-10-17", "2026-10-15"]);
    expect(list[0]).toMatchObject({ answered: 2, preview: "Finished the report.", virtues: [] });
    expect(list[1]).toMatchObject({ answered: 0, virtues: ["justice"] });
  });

  it("Close the day intentions land in the review's own section", async () => {
    const notes = new Notes(new MemoryStorage());
    await closeDay(notes, "2026-10-17", { how: "", learned: "", intentions: "Sleep early." });
    const n = await notes.load("review/2026-10-17.md");
    expect(splitReview(n.body).answers["Intentions for tomorrow"]).toBe("Sleep early.");
  });

  it("support quotes are the built-in thoughts, word for word", () => {
    for (const q of QUESTIONS) {
      if (!q.support) continue;
      const t = BUILTIN.find(x => x.id === q.support!.thought);
      expect(t, q.title).toBeDefined();
      expect(t!.text).toContain(q.support.text.replace(/^…/, ""));
    }
  });
});
