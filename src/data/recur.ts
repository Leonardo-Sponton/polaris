import { addDays, isoDate } from "./dates";
import { t } from "../i18n";

// Repeating tasks (SPEC 5.3). The file keeps a small part of the RFC 5545 RRULE format:
//   FREQ=DAILY|WEEKLY|MONTHLY|YEARLY, INTERVAL=n, BYDAY=MO,TU… (weekly), BYMONTHDAY=d or -1 (monthly).
// Anything else is refused, so a rule the app cannot follow is never silently half-applied.

export type Freq = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

export interface Rule {
  freq: Freq;
  interval: number;
  /** Weekly: days of the week, 0 = Sunday … 6 = Saturday. */
  byDay?: number[];
  /** Monthly: day of the month, or -1 for the last day. */
  byMonthDay?: number;
}

export const DAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];


export function parseRule(s: unknown): Rule | null {
  if (typeof s !== "string" || !s.trim()) return null;
  const parts = new Map<string, string>();
  for (const p of s
    .trim()
    .replace(/^RRULE:/i, "")
    .split(";")) {
    const [k, v] = p.split("=");
    if (!k || v === undefined) return null;
    parts.set(k.toUpperCase(), v.toUpperCase());
  }
  const freq = parts.get("FREQ") as Freq | undefined;
  if (!freq || !["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(freq)) return null;
  const rule: Rule = { freq, interval: 1 };
  for (const [k, v] of parts) {
    if (k === "FREQ") continue;
    if (k === "INTERVAL") {
      const n = Number(v);
      if (!Number.isInteger(n) || n < 1 || n > 999) return null;
      rule.interval = n;
    } else if (k === "BYDAY" && freq === "WEEKLY") {
      const days = v.split(",").map(d => DAY_CODES.indexOf(d));
      if (days.some(d => d < 0)) return null;
      rule.byDay = [...new Set(days)].sort((a, b) => a - b);
    } else if (k === "BYMONTHDAY" && freq === "MONTHLY") {
      const n = Number(v);
      if (!Number.isInteger(n) || !(n === -1 || (n >= 1 && n <= 31))) return null;
      rule.byMonthDay = n;
    } else return null;
  }
  return rule;
}

export function formatRule(r: Rule): string {
  let s = `FREQ=${r.freq}`;
  if (r.interval > 1) s += `;INTERVAL=${r.interval}`;
  if (r.byDay?.length) s += `;BYDAY=${r.byDay.map(d => DAY_CODES[d]).join(",")}`;
  if (r.byMonthDay !== undefined) s += `;BYMONTHDAY=${r.byMonthDay}`;
  return s;
}

/** "Every 2 weeks on Mon, Thu" ("A cada 2 semanas na segunda, quinta"). */
export function describeRule(r: Rule): string {
  const weekday = r.interval === 1 && r.byDay?.join() === "1,2,3,4,5";
  const days = r.byDay?.length ? r.byDay.map(x => t.recur.dayNames[x]) : null;
  return t.recur.describe(r.freq, r.interval, days, r.byMonthDay, weekday);
}

const DAY_MS = 86_400_000;
/** Whole days from a to b, safe across daylight-saving changes. */
const daysBetween = (a: Date, b: Date) =>
  Math.round(
    (Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) /
      DAY_MS,
  );
const mondayOf = (d: Date) => addDays(d, -((d.getDay() + 6) % 7));
const monthLength = (y: number, m: number) => new Date(y, m + 1, 0).getDate();

/** The day a monthly/yearly rule falls on in a given month: the 31st becomes the last day of short months. */
function dayIn(y: number, m: number, want: number) {
  const len = monthLength(y, m);
  return want === -1 ? len : Math.min(want, len);
}

/** Does `d` belong to the series that started on `start`? */
export function matches(r: Rule, start: Date, d: Date): boolean {
  const n = r.interval;
  switch (r.freq) {
    case "DAILY":
      return daysBetween(start, d) % n === 0;
    case "WEEKLY": {
      const days = r.byDay?.length ? r.byDay : [start.getDay()];
      return days.includes(d.getDay()) && (daysBetween(mondayOf(start), mondayOf(d)) / 7) % n === 0;
    }
    case "MONTHLY": {
      const months = (d.getFullYear() - start.getFullYear()) * 12 + d.getMonth() - start.getMonth();
      return months % n === 0 && d.getDate() === dayIn(d.getFullYear(), d.getMonth(), r.byMonthDay ?? start.getDate());
    }
    case "YEARLY":
      return (
        (d.getFullYear() - start.getFullYear()) % n === 0 &&
        d.getMonth() === start.getMonth() &&
        d.getDate() === dayIn(d.getFullYear(), d.getMonth(), start.getDate())
      );
  }
}

/**
 * The first date of the series strictly after `after`. `start` is the date the series is
 * counted from (the task's date). Looks up to 3700 × interval days ahead (ten years for "every year").
 */
export function nextAfter(r: Rule, start: Date, after: Date): Date | null {
  let d = addDays(after, 1);
  for (let i = 0; i < 3700 * r.interval; i++, d = addDays(d, 1)) {
    if (daysBetween(start, d) >= 0 && matches(r, start, d)) return d;
  }
  return null;
}

/**
 * Next date of a repeating task that was just completed (SPEC 5.3). Counted from the task's
 * date; never earlier than tomorrow, so a late task does not come back already overdue and an
 * early one skips the date it was done for.
 */
export function nextDue(r: Rule, taskDate: Date, today: Date): string | null {
  const after = daysBetween(taskDate, today) > 0 ? today : taskDate;
  const n = nextAfter(r, taskDate, after);
  return n ? isoDate(n) : null;
}

/** The first date of the series on or after `from` (a new repeating task starts here). */
export function firstOnOrAfter(r: Rule, from: Date): Date {
  // Weekly on given days: simply the first of those days, whatever the interval.
  if (r.freq === "WEEKLY" && r.byDay?.length) {
    for (let i = 0; i < 7; i++) if (r.byDay.includes(addDays(from, i).getDay())) return addDays(from, i);
  }
  return matches(r, from, from) ? from : (nextAfter(r, from, from) ?? from);
}

/**
 * Fixes the day a monthly rule falls on, from the task's first date. Without it, a task on the
 * 31st would move to the 30th after a short month and stay there.
 */
export function pinRule(r: Rule, start: Date): Rule {
  return r.freq === "MONTHLY" && r.byMonthDay === undefined ? { ...r, byMonthDay: start.getDate() } : r;
}
