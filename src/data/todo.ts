import { addDays, isoDate, isoMinute, parseLocal, slugify, stamp } from "./dates";
import { titleOf, type Data } from "./frontmatter";
import type { Note, Notes } from "./notes";
import { nextDue, parseRule } from "./recur";

// To-do rules (SPEC 3.3 and 5.3): one file per task in todo/, Things-style lists.

export type Status = "open" | "done" | "canceled";

export interface Task {
  path: string;
  title: string;
  status: Status;
  /** ISO date, "someday", or undefined. */
  when?: string;
  evening: boolean;
  due?: string;
  time?: string;
  repeat?: string;
  list?: string;
  priority?: 1 | 2 | 3;
  created: string;
  doneAt?: string;
  subtasks: { done: number; total: number };
}

export type View = "today" | "upcoming" | "anytime" | "someday" | "logbook" | { list: string };

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !!parseLocal(v);

export function toTask(n: Note): Task {
  const d = n.data;
  const status: Status = d.status === "done" || d.status === "canceled" ? d.status : "open";
  const when = d.when === "someday" ? "someday" : isDate(d.when) ? d.when : undefined;
  const p = Number(d.priority);
  const time = str(d.time);
  return {
    path: n.path,
    title: titleOf(n.body) || firstLine(n.body),
    status,
    when,
    evening: d.evening === true,
    due: isDate(d.due) ? d.due : undefined,
    time: time && /^\d{1,2}:\d{2}$/.test(time) ? time.padStart(5, "0") : undefined,
    repeat: parseRule(d.repeat) ? String(d.repeat) : undefined,
    list: str(d.list),
    priority: p === 1 || p === 2 || p === 3 ? p : undefined,
    created: String(d.created ?? ""),
    doneAt: str(d.done_at),
    subtasks: countSubtasks(n.body),
  };
}

function firstLine(body: string) {
  return (body.split("\n").find(l => l.trim()) ?? "").trim();
}

const CHECK = /^\s*[-*+] \[([ xX])\]/;

export function countSubtasks(body: string) {
  let done = 0;
  let total = 0;
  for (const l of body.split("\n")) {
    const m = CHECK.exec(l);
    if (!m) continue;
    total++;
    if (m[1] !== " ") done++;
  }
  return { done, total };
}

/** Unticks every subtask (the next copy of a repeating task starts fresh). */
export function resetSubtasks(body: string): string {
  return body.replace(/^(\s*[-*+] )\[[xX]\]/gm, "$1[ ]");
}

// ---- Title inside the body ----

/** Splits "# Title\n\nnotes" into the title and the rest. Without a leading "# " line the title is "". */
export function splitTitle(body: string): { title: string; rest: string } {
  const m = /^\s*#[ \t]+(.*?)[ \t]*(?:\r?\n|$)(?:[ \t]*\r?\n)?/.exec(body);
  if (!m) return { title: "", rest: body };
  return { title: m[1].replace(/[ \t]+#+$/, ""), rest: body.slice(m[0].length) };
}

export function joinTitle(title: string, rest: string): string {
  const t = title.replace(/\s+/g, " ").trim();
  if (!t) return rest;
  return rest ? `# ${t}\n\n${rest}` : `# ${t}\n`;
}

// ---- Lists ----

/** The date a task counts on: its `when` date, or the due date when there is no `when` date. */
function dayOf(t: Task): string | undefined {
  if (t.when && t.when !== "someday") return t.due && t.due < t.when ? t.due : t.when;
  return t.due;
}

export function isToday(t: Task, today: string): boolean {
  const d = dayOf(t);
  return t.status === "open" && !!d && d <= today;
}

export function isOverdue(t: Task, today: string): boolean {
  return t.status === "open" && ((!!t.due && t.due < today) || (!!t.when && t.when !== "someday" && t.when < today));
}

export function inView(t: Task, view: View, today: string): boolean {
  if (view === "logbook") return t.status !== "open";
  if (t.status !== "open") return false;
  if (typeof view === "object") return t.list === view.list;
  const d = dayOf(t);
  switch (view) {
    case "today":
      return isToday(t, today);
    case "upcoming":
      return !!d && d > today;
    case "someday":
      return t.when === "someday" && !d;
    case "anytime":
      return !t.when && !t.due;
  }
}

const prio = (t: Task) => t.priority ?? 4;

/** Order inside a list: date, then priority, then time, then creation. */
export function compareTasks(a: Task, b: Task): number {
  const da = dayOf(a) ?? (a.when === "someday" ? "9999-99-99" : "9999-00-00");
  const db = dayOf(b) ?? (b.when === "someday" ? "9999-99-99" : "9999-00-00");
  return (
    da.localeCompare(db) ||
    prio(a) - prio(b) ||
    (a.time ?? "99").localeCompare(b.time ?? "99") ||
    a.created.localeCompare(b.created) ||
    a.path.localeCompare(b.path)
  );
}

export interface Section {
  key: string;
  label: string;
  /** The date of the section in Upcoming. */
  day?: string;
  tasks: Task[];
}

/** Tasks of one list, split into the sections shown on screen. */
export function sections(all: Task[], view: View, today: string, now = new Date()): Section[] {
  const tasks = all.filter(t => inView(t, view, today));
  if (view === "logbook") {
    tasks.sort((a, b) => (b.doneAt ?? "").localeCompare(a.doneAt ?? "") || b.path.localeCompare(a.path));
    const out: Section[] = [];
    for (const t of tasks) {
      const day = (t.doneAt ?? "").slice(0, 10);
      let s = out[out.length - 1];
      if (!s || s.day !== day)
        out.push((s = { key: day || "unknown", label: day ? dayLabel(day, now) : "Unknown date", day, tasks: [] }));
      s.tasks.push(t);
    }
    return out;
  }
  tasks.sort(compareTasks);
  if (view === "today") {
    const late = tasks.filter(t => isOverdue(t, today));
    const rest = tasks.filter(t => !isOverdue(t, today));
    return [
      { key: "overdue", label: "Overdue", tasks: late },
      { key: "today", label: "Today", tasks: rest.filter(t => !t.evening) },
      { key: "evening", label: "This Evening", tasks: rest.filter(t => t.evening) },
    ].filter(s => s.tasks.length || s.key === "today");
  }
  if (view === "upcoming") {
    const out: Section[] = [];
    for (const t of tasks) {
      const day = dayOf(t)!;
      let s = out[out.length - 1];
      if (!s || s.day !== day) out.push((s = { key: day, label: dayLabel(day, now), day, tasks: [] }));
      s.tasks.push(t);
    }
    return out;
  }
  return [{ key: "all", label: "", tasks }];
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Today", "Tomorrow", "Friday" (this week), "Fri 23 Oct", "23 Oct 2027". */
export function dayLabel(iso: string, now = new Date(), short = false): string {
  const d = parseLocal(iso);
  if (!d) return iso;
  const today = isoDate(now);
  if (iso === today) return "Today";
  if (iso === isoDate(addDays(now, 1))) return "Tomorrow";
  if (iso === isoDate(addDays(now, -1))) return "Yesterday";
  const diff = Math.round(
    (d.getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86_400_000,
  );
  const wd = WEEKDAYS[d.getDay()];
  if (diff > 1 && diff < 7) return short ? wd.slice(0, 3) : wd;
  const base = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  const withDay = short ? base : `${wd.slice(0, 3)} ${base}`;
  return d.getFullYear() === now.getFullYear() ? withDay : `${base} ${d.getFullYear()}`;
}

// ---- Changes ----

export function taskPath(notes: Notes, title: string, at = new Date()) {
  return notes.freePath("todo", `${stamp(at)}-${slugify(title)}`);
}

export async function createTask(notes: Notes, title: string, data: Data, notesText = ""): Promise<Note> {
  const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined && v !== false));
  return notes.create(
    await taskPath(notes, title),
    { type: "todo", status: "open", ...clean },
    joinTitle(title, notesText),
  );
}

export interface Completed {
  note: Note;
  /** The next copy of a repeating task, created by this completion. */
  next?: Note;
}

/**
 * Marks a task done (or canceled). A repeating task gets a new file for its next date, so the
 * logbook keeps the real history (SPEC 3.3).
 */
export async function finishTask(
  notes: Notes,
  path: string,
  status: "done" | "canceled",
  now = new Date(),
): Promise<Completed> {
  const n = await notes.load(path);
  const note = await notes.save(n, { ...n.data, status, done_at: isoMinute(now) }, n.body);
  const t = toTask(n);
  if (!t.repeat || t.status !== "open") return { note };
  const rule = parseRule(t.repeat)!;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const base = parseLocal(t.when !== "someday" ? (t.when ?? t.due) : t.due) ?? today;
  const when = nextDue(rule, base, today);
  if (!when) return { note };
  const { created: _c, modified: _m, done_at: _d, status: _s, remind: _r, ...keep } = n.data;
  const data: Data = { ...keep, status: "open", when };
  // The due date moves by the same number of days as the task date.
  if (t.due) {
    const shift = Math.round((parseLocal(when)!.getTime() - base.getTime()) / 86_400_000);
    data.due = isoDate(addDays(parseLocal(t.due)!, shift));
  }
  const next = await notes.create(await taskPath(notes, t.title, now), data, resetSubtasks(n.body));
  return { note, next };
}

/** Undo for finishTask: the task is open again and the copy it created is removed. */
export async function undoFinish(notes: Notes, c: Completed) {
  if (c.next) await notes.storage.remove(c.next.path);
  const n = await notes.load(c.note.path);
  const { done_at: _d, ...rest } = n.data;
  await notes.save(n, { ...rest, status: "open" }, n.body);
}

export async function reopenTask(notes: Notes, path: string) {
  const n = await notes.load(path);
  const { done_at: _d, ...rest } = n.data;
  await notes.save(n, { ...rest, status: "open" }, n.body);
}

/** Sets or clears header fields of a task file (undefined removes a key). */
export async function updateTask(notes: Notes, path: string, patch: Data) {
  const n = await notes.load(path);
  return notes.save(n, { ...n.data, ...patch }, n.body);
}

export async function loadTasks(notes: Notes, onError?: (path: string) => void): Promise<Task[]> {
  const list = await notes.loadDir("todo", p => onError?.(p));
  return list.filter(n => n.data.type === undefined || n.data.type === "todo").map(toTask);
}
