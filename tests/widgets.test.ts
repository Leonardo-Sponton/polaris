import { describe, expect, it } from "vitest";
import { addDays, isoDate } from "../src/data/dates";
import { nextDue, parseRule } from "../src/data/recur";
import { buildSnapshot, type WidgetInput } from "../src/data/widgets";
import type { Task } from "../src/data/todo";

// The widgets complete repeating tasks in Java (Recur.java). Its test reads the cases below,
// computed here by the app's own code, so both always agree. After changing recur.ts run
// `npx vitest run -u` to write the file again, then the Android tests.
const FIXTURE = "../android/app/src/test/resources/recur-cases.json";

const RULES = [
  "FREQ=DAILY",
  "FREQ=DAILY;INTERVAL=3",
  "FREQ=WEEKLY",
  "FREQ=WEEKLY;INTERVAL=2",
  "FREQ=WEEKLY;BYDAY=MO,TH",
  "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
  "FREQ=WEEKLY;INTERVAL=2;BYDAY=SA,SU",
  "FREQ=MONTHLY",
  "FREQ=MONTHLY;BYMONTHDAY=31",
  "FREQ=MONTHLY;BYMONTHDAY=-1",
  "FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=15",
  "FREQ=YEARLY",
  "FREQ=YEARLY;INTERVAL=2",
  "RRULE:FREQ=DAILY",
  "FREQ=HOURLY",
  "FREQ=DAILY;BYDAY=MO",
  "FREQ=WEEKLY;BYDAY=XX",
  "FREQ=DAILY;INTERVAL=0",
  "",
];

function cases() {
  const out: { rule: string; base: string; today: string; next: string | null }[] = [];
  const bases = ["2026-01-31", "2026-10-17", "2028-02-29", "2026-12-28", "2027-03-30"];
  for (const rule of RULES) {
    for (const b of bases) {
      for (const shift of [-40, -3, -1, 0, 1, 5]) {
        const base = new Date(b + "T00:00");
        const today = addDays(base, shift);
        const r = parseRule(rule);
        out.push({ rule, base: b, today: isoDate(today), next: r ? nextDue(r, base, today) : null });
      }
    }
  }
  return out;
}

describe("widgets", () => {
  it("Java repeat cases match recur.ts", async () => {
    await expect(JSON.stringify(cases(), null, 1) + "\n").toMatchFileSnapshot(FIXTURE);
  });

  const task = (path: string, f: Partial<Task>): Task => ({
    path,
    title: path,
    status: "open",
    evening: false,
    created: "2026-10-01T10:00",
    subtasks: { done: 0, total: 0 },
    ...f,
  });

  const empty: WidgetInput = {
    root: "/data",
    colors: {},
    tasks: [],
    inbox: [],
    notes: [],
    ideas: [],
    projects: [],
    books: [],
    quotes: [],
    thoughts: { all: [], state: { favorites: [], days: {} } },
    journal: [],
    reviews: [],
  };

  it("snapshot keeps a week of open tasks and today's done ones", () => {
    const now = new Date(2026, 9, 18, 10, 0);
    const s = buildSnapshot(
      {
        ...empty,
        tasks: [
          task("todo/late.md", { when: "2026-10-10" }),
          task("todo/due.md", { when: "2026-10-30", due: "2026-10-17" }),
          task("todo/today.md", { when: "2026-10-18", time: "09:00" }),
          task("todo/week.md", { when: "2026-10-25" }),
          task("todo/later.md", { when: "2026-10-26" }),
          task("todo/someday.md", { when: "someday" }),
          task("todo/anytime.md", {}),
          task("todo/done.md", { status: "done", when: "2026-10-18", doneAt: "2026-10-18T08:00" }),
          task("todo/old.md", { status: "done", when: "2026-10-17", doneAt: "2026-10-17T08:00" }),
        ],
      },
      now,
    );
    expect(s.tasks.map(k => [k.path, k.day, k.done])).toEqual([
      ["todo/late.md", "2026-10-10", false],
      ["todo/due.md", "2026-10-17", false],
      ["todo/today.md", "2026-10-18", false],
      ["todo/week.md", "2026-10-25", false],
      ["todo/done.md", "2026-10-18", true],
    ]);
    expect(s.root).toBe("/data");
    expect(s.journal).toEqual({ day: "2026-10-18", preview: "", written: false, mood: undefined, moodColor: undefined });
    expect(s.labels.done).toBe("Done: %s");
  });
});
