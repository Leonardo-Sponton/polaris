import { describe, expect, it } from "vitest";
import { MemoryStorage } from "../src/storage/memory";
import { Notes } from "../src/data/notes";
import { createTask, finishTask, loadTasks, toTask, type Task } from "../src/data/todo";
import { reminderId, reminderOf, sameReminders, upcomingReminders } from "../src/data/reminders";

const NOW = new Date(2026, 9, 17, 10, 0); // Sat 17 Oct 2026 10:00

function task(data: Record<string, unknown>, path = "todo/a.md", title = "A"): Task {
  return toTask({ path, data: { type: "todo", status: "open", ...data }, body: `# ${title}\n`, mtime: 0 } as never);
}

describe("reminders", () => {
  it("uses the date + time when no reminder is set", () => {
    expect(reminderOf(task({ when: "2026-10-18", time: "17:00" }))).toBe("2026-10-18T17:00");
    expect(reminderOf(task({ when: "2026-10-18" }))).toBeUndefined();
    expect(reminderOf(task({ time: "17:00" }))).toBeUndefined();
    expect(reminderOf(task({ when: "someday", time: "17:00" }))).toBeUndefined();
  });

  it("a set reminder wins, and none turns it off", () => {
    expect(reminderOf(task({ when: "2026-10-18", time: "17:00", remind: "2026-10-18T16:30" }))).toBe("2026-10-18T16:30");
    expect(reminderOf(task({ remind: "2026-10-19T08:00" }))).toBe("2026-10-19T08:00");
    expect(reminderOf(task({ when: "2026-10-18", time: "17:00", remind: "none" }))).toBeUndefined();
    expect(reminderOf(task({ remind: "tomorrow" }))).toBeUndefined();
  });

  it("lists only open tasks in the future, nearest first", () => {
    const list = upcomingReminders(
      [
        task({ when: "2026-10-18", time: "09:00" }, "todo/b.md", "B"),
        task({ when: "2026-10-17", time: "11:00" }, "todo/c.md", "C"),
        task({ when: "2026-10-17", time: "09:59" }, "todo/past.md"),
        task({ when: "2026-10-17", time: "10:00" }, "todo/now.md"),
        task({ status: "done", when: "2026-10-18", time: "09:00" }, "todo/done.md"),
        task({ when: "2026-10-18", time: "08:00", list: "home" }, "todo/d.md", "D"),
      ],
      NOW,
    );
    expect(list.map(r => [r.title, r.at, r.text])).toEqual([
      ["C", "2026-10-17T11:00", "11:00"],
      ["D", "2026-10-18T08:00", "08:00 · #home"],
      ["B", "2026-10-18T09:00", "09:00"],
    ]);
  });

  it("keeps only the nearest ones", () => {
    const many = Array.from({ length: 10 }, (_, i) => task({ when: `2026-10-${20 + i}`, time: "09:00" }, `todo/${i}.md`));
    expect(upcomingReminders(many, NOW, 3).map(r => r.path)).toEqual(["todo/0.md", "todo/1.md", "todo/2.md"]);
  });

  it("ids are stable, positive and differ per file", () => {
    const a = reminderId("todo/20261017-101010-a.md");
    expect(a).toBe(reminderId("todo/20261017-101010-a.md"));
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThanOrEqual(0x7fffffff);
    expect(reminderId("todo/20261017-101010-b.md")).not.toBe(a);
  });

  it("sameReminders compares ids and times", () => {
    const a = upcomingReminders([task({ when: "2026-10-18", time: "09:00" })], NOW);
    const b = upcomingReminders([task({ when: "2026-10-18", time: "09:30" })], NOW);
    expect(sameReminders(a, a.slice())).toBe(true);
    expect(sameReminders(a, b)).toBe(false);
    expect(sameReminders(a, [])).toBe(false);
  });

  it("a repeating task's next copy moves its set reminder with the date", async () => {
    const notes = new Notes(new MemoryStorage());
    const n = await createTask(notes, "Pay rent", { when: "2026-10-05", repeat: "FREQ=MONTHLY;BYMONTHDAY=5", remind: "2026-10-04T20:00" });
    const c = await finishTask(notes, n.path, "done", NOW);
    expect(c.next!.data.when).toBe("2026-11-05");
    expect(c.next!.data.remind).toBe("2026-11-04T20:00");
    const tasks = await loadTasks(notes);
    expect(tasks.find(t => t.path === c.next!.path)!.remind).toBe("2026-11-04T20:00");
  });
});
