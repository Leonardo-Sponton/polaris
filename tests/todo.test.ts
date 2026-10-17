import { describe, expect, it } from "vitest";
import { MemoryStorage } from "../src/storage/memory";
import { Notes } from "../src/data/notes";
import { parseQuickAdd } from "../src/data/quickadd";
import { describeRule, nextDue, parseRule } from "../src/data/recur";
import {
  countSubtasks,
  createTask,
  dayLabel,
  finishTask,
  joinTitle,
  loadTasks,
  sections,
  splitTitle,
  toTask,
  undoFinish,
  type Task,
} from "../src/data/todo";
import { allLists } from "../src/data/lists";
import { moveToTrash, restoreFromTrash } from "../src/data/trash";

const SAT = new Date(2026, 9, 17); // Saturday 17 Oct 2026
const WED = new Date(2026, 9, 14);
const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);

describe("quick add", () => {
  // input → expected result (only the keys that are set)
  const table: [string, object, Date?][] = [
    [
      "Buy milk tomorrow at 5pm #home !1",
      { title: "Buy milk", when: "2026-10-18", time: "17:00", list: "home", priority: 1 },
    ],
    ["Call mom on fri", { title: "Call mom", when: "2026-10-23" }],
    ["fri", { title: "", when: "2026-10-16" }, WED],
    ["next fri", { title: "", when: "2026-10-23" }, WED],
    ["Report next week", { title: "Report", when: "2026-10-19" }],
    ["Dentist 20/10 17:00", { title: "Dentist", when: "2026-10-20", time: "17:00" }],
    ["Trip oct 20", { title: "Trip", when: "2026-10-20" }],
    ["Renew passport oct 1", { title: "Renew passport", when: "2027-10-01" }],
    ["Party 5 dec 2027", { title: "Party", when: "2027-12-05" }],
    ["Exam 2026-11-03", { title: "Exam", when: "2026-11-03" }],
    ["Bill in 3 days", { title: "Bill", when: "2026-10-20" }],
    ["Read tonight", { title: "Read", when: "2026-10-17", evening: true }],
    ["Stretch evening", { title: "Stretch", when: "2026-10-17", evening: true }],
    ["Call at 9am", { title: "Call", when: "2026-10-17", time: "09:00" }],
    ["Learn piano someday", { title: "Learn piano", when: "someday" }],
    ["Pay rent every month on the 5th", { title: "Pay rent", when: "2026-11-05", repeat: "FREQ=MONTHLY;BYMONTHDAY=5" }],
    ["Gym every mon and thu", { title: "Gym", when: "2026-10-19", repeat: "FREQ=WEEKLY;BYDAY=MO,TH" }],
    ["Water plants every day", { title: "Water plants", when: "2026-10-17", repeat: "FREQ=DAILY" }],
    ["Backup every 2 weeks", { title: "Backup", when: "2026-10-17", repeat: "FREQ=WEEKLY;INTERVAL=2" }],
    ["Budget every month", { title: "Budget", when: "2026-10-17", repeat: "FREQ=MONTHLY;BYMONTHDAY=17" }],
    [
      "Standup every weekday at 9:30",
      { title: "Standup", when: "2026-10-19", time: "09:30", repeat: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR" },
    ],
    [
      "Review every other week on fri",
      { title: "Review", when: "2026-10-23", repeat: "FREQ=WEEKLY;INTERVAL=2;BYDAY=FR" },
    ],
    ["Clean oven every friday tomorrow", { title: "Clean oven", when: "2026-10-18", repeat: "FREQ=WEEKLY;BYDAY=FR" }],
    ["Invoice every 5th", { title: "Invoice", when: "2026-11-05", repeat: "FREQ=MONTHLY;BYMONTHDAY=5" }],
    [
      "Taxes every 3 months on the last day",
      { title: "Taxes", when: "2026-10-31", repeat: "FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=-1" },
    ],
    ["Buy 2 eggs every 3 days", { title: "Buy 2 eggs", repeat: "FREQ=DAILY;INTERVAL=3" }],
    // Not dates: they stay in the title.
    ["Buy sun cream", { title: "Buy sun cream", when: undefined }],
    ["Mondays meeting notes", { title: "Mondays meeting notes", when: undefined }],
    ["Pay 31/02", { title: "Pay 31/02", when: undefined }],
    ["Meet at 25", { title: "Meet at 25", time: undefined }],
    ["Score !4", { title: "Score !4", priority: undefined }],
    ["Two dates today tomorrow", { title: "Two dates tomorrow", when: "2026-10-17" }],
    ["Tag #side-project here", { title: "Tag here", list: "side-project" }],
  ];
  for (const [input, want, today] of table) {
    it(input, () => {
      const got = parseQuickAdd(input, today ?? SAT) as unknown as Record<string, unknown>;
      for (const [k, v] of Object.entries(want)) expect(got[k], k).toEqual(v);
    });
  }

  it("reports the recognized parts for highlighting", () => {
    const q = parseQuickAdd("Buy milk tomorrow #home", SAT);
    expect(q.spans.map(s => [s.kind, "Buy milk tomorrow #home".slice(s.start, s.end)])).toEqual([
      ["date", "tomorrow"],
      ["list", "#home"],
    ]);
  });
});

describe("recurrence", () => {
  it("reads only rules it can follow", () => {
    expect(parseRule("FREQ=WEEKLY;BYDAY=MO,TH")).toEqual({ freq: "WEEKLY", interval: 1, byDay: [1, 4] });
    expect(parseRule("FREQ=HOURLY")).toBeNull();
    expect(parseRule("FREQ=WEEKLY;BYDAY=XX")).toBeNull();
    expect(parseRule("FREQ=DAILY;COUNT=3")).toBeNull();
    expect(parseRule(undefined)).toBeNull();
  });

  it("describes rules", () => {
    expect(describeRule(parseRule("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR")!)).toBe("Every weekday");
    expect(describeRule(parseRule("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO")!)).toBe("Every 2 weeks on Mon");
    expect(describeRule(parseRule("FREQ=MONTHLY;BYMONTHDAY=-1")!)).toBe("Every month on the last day");
    expect(describeRule(parseRule("FREQ=MONTHLY;BYMONTHDAY=22")!)).toBe("Every month on the 22nd");
  });

  it("every description reads back as the same rule", () => {
    for (const r of [
      "FREQ=DAILY",
      "FREQ=DAILY;INTERVAL=3",
      "FREQ=WEEKLY;BYDAY=MO",
      "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TH",
      "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
      "FREQ=MONTHLY;BYMONTHDAY=22",
      "FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=-1",
      "FREQ=YEARLY",
    ]) {
      expect(parseQuickAdd(describeRule(parseRule(r)!), SAT).repeat, r).toBe(
        r.startsWith("FREQ=YEARLY") ? "FREQ=YEARLY" : r,
      );
    }
  });

  const next = (rule: string, from: Date, today: Date) => nextDue(parseRule(rule)!, from, today);

  it("next date after completing", () => {
    expect(next("FREQ=WEEKLY;BYDAY=MO,TH", d(2026, 10, 19), d(2026, 10, 19))).toBe("2026-10-22");
    expect(next("FREQ=WEEKLY;BYDAY=MO,TH", d(2026, 10, 22), d(2026, 10, 22))).toBe("2026-10-26");
    expect(next("FREQ=WEEKLY;INTERVAL=2", d(2026, 10, 19), d(2026, 10, 19))).toBe("2026-11-02");
    expect(next("FREQ=MONTHLY;BYMONTHDAY=31", d(2027, 1, 31), d(2027, 1, 31))).toBe("2027-02-28");
    expect(next("FREQ=MONTHLY;BYMONTHDAY=31", d(2027, 2, 28), d(2027, 2, 28))).toBe("2027-03-31");
    expect(next("FREQ=YEARLY", d(2028, 2, 29), d(2028, 2, 29))).toBe("2029-02-28");
  });

  it("a late task does not come back overdue; an early one skips its date", () => {
    expect(next("FREQ=DAILY", d(2026, 10, 10), SAT)).toBe("2026-10-18");
    expect(next("FREQ=DAILY", d(2026, 10, 20), SAT)).toBe("2026-10-21");
    expect(next("FREQ=WEEKLY", d(2026, 10, 5), SAT)).toBe("2026-10-19");
  });
});

describe("tasks", () => {
  it("title in the body", () => {
    expect(splitTitle("# Buy milk\n\n- [ ] 2 l\n")).toEqual({ title: "Buy milk", rest: "- [ ] 2 l\n" });
    expect(splitTitle("# Only\n")).toEqual({ title: "Only", rest: "" });
    expect(splitTitle("no title")).toEqual({ title: "", rest: "no title" });
    expect(joinTitle("Buy milk", "- [ ] 2 l\n")).toBe("# Buy milk\n\n- [ ] 2 l\n");
    expect(joinTitle("  ", "notes")).toBe("notes");
    expect(countSubtasks("- [x] a\n- [ ] b\n  * [X] c\ntext")).toEqual({ done: 2, total: 3 });
  });

  const task = (p: Partial<Task>): Task => ({
    path: `todo/${p.title}.md`,
    title: "t",
    status: "open",
    evening: false,
    created: "2026-10-01T10:00",
    subtasks: { done: 0, total: 0 },
    ...p,
  });

  it("list rules", () => {
    const today = "2026-10-17";
    const all = [
      task({ title: "late", when: "2026-10-10" }),
      task({ title: "due-late", due: "2026-10-16" }),
      task({ title: "now", when: today, priority: 1 }),
      task({ title: "now2", when: today }),
      task({ title: "eve", when: today, evening: true }),
      task({ title: "soon", when: "2026-10-20" }),
      task({ title: "due-soon", due: "2026-10-20", when: "someday" }),
      task({ title: "free" }),
      task({ title: "later", when: "someday" }),
      task({ title: "home", list: "home" }),
      task({ title: "done", status: "done", when: today, doneAt: "2026-10-17T09:00" }),
    ];
    const names = (v: Parameters<typeof sections>[1]) =>
      sections(all, v, today, SAT).map(s => [s.label, s.tasks.map(t => t.title)]);
    expect(names("today")).toEqual([
      ["Overdue", ["late", "due-late"]],
      ["Today", ["now", "now2"]],
      ["This Evening", ["eve"]],
    ]);
    expect(names("upcoming")).toEqual([["Tuesday", ["due-soon", "soon"]]]);
    expect(names("anytime")).toEqual([["", ["free", "home"]]]);
    expect(names("someday")).toEqual([["", ["later"]]]);
    expect(names({ list: "home" })).toEqual([["", ["home"]]]);
    expect(names("logbook")).toEqual([["Today", ["done"]]]);
  });

  it("day labels", () => {
    expect(dayLabel("2026-10-18", SAT)).toBe("Tomorrow");
    expect(dayLabel("2026-10-21", SAT)).toBe("Wednesday");
    expect(dayLabel("2026-10-30", SAT)).toBe("Fri 30 Oct");
    expect(dayLabel("2027-01-02", SAT)).toBe("2 Jan 2027");
  });

  it("finishing a repeating task logs it and creates the next one; undo reverts both", async () => {
    const notes = new Notes(new MemoryStorage());
    const n = await createTask(
      notes,
      "Water plants",
      { when: "2026-10-17", due: "2026-10-18", repeat: "FREQ=DAILY", remind: "2026-10-17T08:00" },
      "- [x] front\n- [ ] back\n",
    );
    const c = await finishTask(notes, n.path, "done", new Date(2026, 9, 17, 9, 30));
    expect(c.note.data).toMatchObject({ status: "done", done_at: "2026-10-17T09:30" });
    const next = toTask(c.next!);
    expect(next).toMatchObject({ title: "Water plants", status: "open", when: "2026-10-18", due: "2026-10-19" });
    expect(c.next!.data.remind).toBe("2026-10-18T08:00");
    expect(c.next!.body).toBe("# Water plants\n\n- [ ] front\n- [ ] back\n");
    expect((await loadTasks(notes)).length).toBe(2);

    await undoFinish(notes, c);
    const left = await loadTasks(notes);
    expect(left.map(t => [t.status, t.doneAt])).toEqual([["open", undefined]]);
  });

  it("lists named by tasks but missing from lists.json still show", () => {
    expect(allLists([{ id: "home", name: "Home", color: "ok" }], ["home", "work", undefined]).map(l => l.id)).toEqual([
      "home",
      "work",
    ]);
  });

  it("trash keeps the path and never overwrites", async () => {
    const s = new MemoryStorage();
    await s.write("todo/a.md", "1");
    expect(await moveToTrash(s, "todo/a.md")).toBe(".trash/todo/a.md");
    await s.write("todo/a.md", "2");
    expect(await moveToTrash(s, "todo/a.md")).toBe(".trash/todo/a-2.md");
    await restoreFromTrash(s, ".trash/todo/a-2.md", "todo/a.md");
    expect(await s.read("todo/a.md")).toBe("2");
  });
});
