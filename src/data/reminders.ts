import { isoMinute, parseLocal } from "./dates";
import type { Task } from "./todo";

// Reminders (SPEC 5.3). A task reminds at its `remind` time when it has one; otherwise at its
// date + time ("Dentist tomorrow at 5pm" reminds tomorrow at 17:00). `remind: none` turns the
// reminder off. Only open tasks remind, and only in the future.

export interface Reminder {
  /** Stable number per task file (Android notifications are identified by a number). */
  id: number;
  path: string;
  title: string;
  /** Local time, ISO minute. */
  at: string;
  /** Second line of the notification. */
  text: string;
}

/** The reminder time a task asks for, or undefined. */
export function reminderOf(t: Task): string | undefined {
  if (t.remind === "none") return undefined;
  if (t.remind) return t.remind;
  if (t.time && t.when && t.when !== "someday") return `${t.when}T${t.time}`;
  return undefined;
}

/** 32-bit FNV-1a of the path, kept positive and non-zero. */
export function reminderId(path: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < path.length; i++) {
    h ^= path.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 1) || 1;
}

/** Android keeps at most 500 alarms per app; the nearest ones are enough. */
export const MAX_REMINDERS = 64;

export function upcomingReminders(tasks: Task[], now = new Date(), max = MAX_REMINDERS): Reminder[] {
  const from = isoMinute(now);
  const out: Reminder[] = [];
  for (const t of tasks) {
    if (t.status !== "open") continue;
    const at = reminderOf(t);
    if (!at || at <= from || !parseLocal(at)) continue;
    const parts = [t.time ? t.time : "", t.list ? `#${t.list}` : ""].filter(Boolean);
    out.push({ id: reminderId(t.path), path: t.path, title: t.title || "(untitled task)", at, text: parts.join(" · ") });
  }
  return out.sort((a, b) => a.at.localeCompare(b.at) || a.path.localeCompare(b.path)).slice(0, max);
}

/** Same reminders, same times: nothing to reschedule. */
export function sameReminders(a: Reminder[], b: Reminder[]): boolean {
  return a.length === b.length && a.every((r, i) => r.id === b[i].id && r.at === b[i].at && r.title === b[i].title && r.text === b[i].text);
}
