import { describe, expect, it } from "vitest";
import { MemoryStorage } from "../src/storage/memory";
import { Notes } from "../src/data/notes";
import {
  BUILTIN,
  STATE_PATH,
  StateError,
  ThoughtError,
  createThought,
  dayNumber,
  dupKey,
  filterThoughts,
  loadState,
  loadThoughts,
  pickForDay,
  problems,
  randomThought,
  saveThought,
  setFavorite,
  thoughtOfDay,
  values,
} from "../src/data/thoughts";

describe("thoughts", () => {
  it("ships the 64 checked thoughts, each with a source and a named translation", () => {
    expect(BUILTIN).toHaveLength(64);
    expect(new Set(BUILTIN.map(t => t.id)).size).toBe(64);
    for (const t of BUILTIN) {
      expect(t.text && t.author && t.translation).toBeTruthy();
      if (t.kind === "verified") expect(t.source).toMatch(/^https:\/\//);
    }
    expect(BUILTIN.filter(t => t.kind === "uncertain").map(t => t.id)).toEqual(["kie-diario-1843"]);
    expect(values(BUILTIN, "tradition")).toHaveLength(13);
    expect(values(BUILTIN, "author")).toHaveLength(24);
  });

  it("counts days like Python's date.toordinal (MyNotes)", () => {
    expect(dayNumber("0001-01-01")).toBe(1);
    expect(dayNumber("1970-01-01")).toBe(719163);
    expect(dayNumber("2026-10-17") - dayNumber("2026-10-16")).toBe(1);
  });

  it("thought of the day: fixed for the day, changes daily, a pick overrides it", () => {
    const st = { favorites: [], days: {} };
    const a = thoughtOfDay(BUILTIN, st, "2026-10-17")!;
    expect(a.picked).toBe(false);
    expect(thoughtOfDay(BUILTIN, st, "2026-10-17")!.thought.id).toBe(a.thought.id);
    expect(thoughtOfDay(BUILTIN, st, "2026-10-18")!.thought.id).not.toBe(a.thought.id);
    expect(a.thought).toBe(BUILTIN[dayNumber("2026-10-17") % 64]);
    const picked = thoughtOfDay(BUILTIN, { favorites: [], days: { "2026-10-17": "pas-277" } }, "2026-10-17")!;
    expect(picked).toEqual({ thought: BUILTIN.find(t => t.id === "pas-277"), picked: true });
    // A pick that no longer exists falls back to the daily one.
    expect(thoughtOfDay(BUILTIN, { favorites: [], days: { "2026-10-17": "gone" } }, "2026-10-17")!.picked).toBe(false);
    expect(thoughtOfDay([], st)).toBeNull();
  });

  it("checks required fields per kind", () => {
    expect(problems({ kind: "mine", text: "  " })).toEqual(["Write the thought."]);
    expect(problems({ kind: "mine", text: "Mine" })).toEqual([]);
    expect(problems({ kind: "verified", text: "Q", author: "A" })).toHaveLength(1);
    expect(problems({ kind: "verified", text: "Q", author: "A", source: "p. 4" })).toEqual([]);
    expect(problems({ kind: "uncertain", text: "Q" })).toEqual(["Say who it is usually attributed to."]);
    expect(problems({ kind: "mine", text: "x".repeat(1501) })[0]).toMatch(/Too long/);
  });

  it("refuses repeats, ignoring accents, case and punctuation", async () => {
    expect(dupKey("Nothing, Lucilius, is ours!", "Séneca")).toBe(dupKey("nothing lucilius is ours", "seneca"));
    const notes = new Notes(new MemoryStorage());
    const t = BUILTIN.find(x => x.id === "pas-277")!;
    await expect(createThought(notes, BUILTIN, { kind: "verified", text: t.text.toUpperCase(), author: "blaise pascal", source: "x" })).rejects.toThrow(
      ThoughtError,
    );
  });

  it("creates, edits and lists own thoughts after the built-in ones", async () => {
    const notes = new Notes(new MemoryStorage());
    const n = await createThought(
      notes,
      BUILTIN,
      { kind: "mine", text: "Write less, think more.", themes: ["Writing", "writing", " thinking "] },
      new Date(2026, 9, 17, 9, 30, 0),
    );
    expect(n.path).toBe("thoughts/20261017-093000.md");
    expect(n.data).toMatchObject({ type: "thought", kind: "mine", themes: ["writing", "thinking"] });
    expect(n.body).toBe("Write less, think more.\n");

    let { all } = await loadThoughts(notes);
    expect(all).toHaveLength(65);
    const mine = all[64];
    expect(mine).toMatchObject({ id: "20261017-093000", builtin: false, kind: "mine" });

    // A key the form does not know survives an edit.
    await notes.patchHeader(mine.path!, { mood: "calm" });
    ({ all } = await loadThoughts(notes));
    await saveThought(notes, all, all[64], { kind: "uncertain", text: "Write less.", author: "Someone" });
    ({ all } = await loadThoughts(notes));
    expect(all[64]).toMatchObject({ kind: "uncertain", text: "Write less.", author: "Someone" });
    expect(all[64].note!.data.mood).toBe("calm");
    await expect(saveThought(notes, all, BUILTIN[0], { kind: "mine", text: "x" })).rejects.toThrow(ThoughtError);
  });

  it("keeps favorites (state file for built-in, header for own) with undo", async () => {
    const notes = new Notes(new MemoryStorage());
    const undo = await setFavorite(notes, BUILTIN[0], true);
    let { all } = await loadThoughts(notes);
    expect(all[0].favorite).toBe(true);
    await undo();
    ({ all } = await loadThoughts(notes));
    expect(all[0].favorite).toBe(false);

    const n = await createThought(notes, BUILTIN, { kind: "mine", text: "Own" });
    ({ all } = await loadThoughts(notes));
    await setFavorite(notes, all[64], true);
    expect((await notes.load(n.path)).data.favorite).toBe(true);
    ({ all } = await loadThoughts(notes));
    expect(filterThoughts(all, { favorites: true }).map(t => t.id)).toEqual([all[64].id]);
  });

  it("picks today's thought with undo, keeping other keys of the state file", async () => {
    const s = new MemoryStorage();
    await s.write(STATE_PATH, JSON.stringify({ future: 1, days: { "2026-10-16": "lao-33" } }));
    const undo = await pickForDay(s, "pas-139", "2026-10-17");
    expect((await loadState(s)).days).toEqual({ "2026-10-16": "lao-33", "2026-10-17": "pas-139" });
    expect(JSON.parse(await s.read(STATE_PATH)).future).toBe(1);
    await undo();
    expect((await loadState(s)).days).toEqual({ "2026-10-16": "lao-33" });
  });

  it("never writes over a state file it cannot read", async () => {
    const s = new MemoryStorage();
    await s.write(STATE_PATH, "{ broken");
    await expect(loadState(s)).rejects.toThrow(StateError);
    await expect(pickForDay(s, "pas-139")).rejects.toThrow(StateError);
    expect(await s.read(STATE_PATH)).toBe("{ broken");
    const r = await loadThoughts(new Notes(s));
    expect(r.all).toHaveLength(64);
    expect(r.stateError).toMatch(/could not be read/);
  });

  it("filters by text (accents ignored), author, tradition, theme and origin", () => {
    expect(new Set(filterThoughts(BUILTIN, { text: "LUCILIUS" }).map(t => t.author))).toEqual(new Set(["Seneca", "Epicurus"]));
    expect(filterThoughts(BUILTIN, { text: "seneque" })).toHaveLength(0);
    expect(filterThoughts(BUILTIN, { text: "søren" })).toHaveLength(2);
    expect(filterThoughts(BUILTIN, { text: "laertius" }).length).toBeGreaterThan(0);
    expect(filterThoughts(BUILTIN, { author: "Laozi" }).map(t => t.id)).toEqual(["lao-33", "lao-64"]);
    expect(filterThoughts(BUILTIN, { tradition: "Taoism" })).toHaveLength(3);
    expect(filterThoughts(BUILTIN, { theme: "self-examination" }).map(t => t.id)).toEqual(["sen-ira-3-36a", "sen-ira-3-36b"]);
    expect(filterThoughts(BUILTIN, { origin: "uncertain" })).toHaveLength(1);
    expect(filterThoughts(BUILTIN, { origin: "mine" })).toHaveLength(0);
  });

  it("random avoids the one on screen", () => {
    const two = BUILTIN.slice(0, 2);
    expect(randomThought(two, two[0].id, () => 0)).toBe(two[1]);
    expect(randomThought(two.slice(0, 1), two[0].id)).toBe(two[0]);
    expect(randomThought([])).toBeUndefined();
  });
});
