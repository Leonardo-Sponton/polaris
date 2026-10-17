import { addDays, isoDate, slugify } from "./dates";
import { firstOnOrAfter, formatRule, parseRule, pinRule, type Rule } from "./recur";

// One-line quick add, Todoist style (SPEC 5.3): "Buy milk tomorrow at 5pm #home !1 every week".
// Each recognized part is cut out of the title and reported as a span, so the UI can highlight it.
// Only the first part of each kind counts; a second date, list… stays in the title as typed.

export type TokenKind = "date" | "time" | "repeat" | "list" | "priority" | "evening";

export interface Span {
  start: number;
  end: number;
  kind: TokenKind;
}

export interface QuickAdd {
  title: string;
  /** ISO date, or "someday". */
  when?: string;
  evening?: boolean;
  /** "17:00". */
  time?: string;
  /** RRULE text, see recur.ts. */
  repeat?: string;
  /** List id (slug) and the name as typed. */
  list?: string;
  listName?: string;
  priority?: 1 | 2 | 3;
  spans: Span[];
}

// Letters or digits must not touch a token on either side ("Monday" inside "Mondays" is not a date).
const B = "(?<![\\p{L}\\p{N}])";
const E = "(?![\\p{L}\\p{N}])";

// "sat" and "sun" alone are common words ("sun cream"); those two need the full name.
const WD = "(?:mon(?:day)?|tue(?:s(?:day)?)?|wed(?:s|nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|saturday|sunday)";
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MON =
  "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const ORD = "(?:st|nd|rd|th)?";

const dayOf = (word: string) =>
  ["sun", "mon", "tue", "wed", "thu", "fri", "sat"].indexOf(word.slice(0, 3).toLowerCase());
const monthOf = (word: string) => MONTHS.indexOf(word.slice(0, 3).toLowerCase());

/** A real calendar date or null; a date without year that already passed means next year. */
function makeDate(today: Date, y: number | undefined, m: number, d: number): Date | null {
  const year = y === undefined ? today.getFullYear() : y < 100 ? 2000 + y : y;
  const r = new Date(year, m, d);
  if (r.getMonth() !== m || r.getDate() !== d) return null;
  if (y === undefined && r < new Date(today.getFullYear(), today.getMonth(), today.getDate())) r.setFullYear(year + 1);
  return r;
}

const nextWeekday = (today: Date, day: number) => addDays(today, ((day - today.getDay() + 6) % 7) + 1);
const mondayNextWeek = (today: Date) => addDays(today, 7 - ((today.getDay() + 6) % 7));

type Value = Partial<Omit<QuickAdd, "title" | "spans">> & { start?: Date };

interface Matcher {
  kind: TokenKind;
  re: RegExp;
  read(m: RegExpExecArray, today: Date): Value | null;
}

const rx = (s: string) => new RegExp(`${B}${s}${E}`, "giu");

function rule(r: Rule): Value {
  return { repeat: formatRule(r) };
}

const UNIT = { day: "DAILY", week: "WEEKLY", month: "MONTHLY", year: "YEARLY" } as const;
const count = (s: string | undefined) => (!s ? 1 : s.toLowerCase() === "other" ? 2 : Number(s));

const MATCHERS: Matcher[] = [
  // ---- repeat (before dates, so "every monday" is not read as "monday") ----
  {
    kind: "repeat",
    re: rx(`every\\s+(?:(?:(other|\\d{1,3})\\s+)?weeks?\\s+on\\s+)?(${WD}(?:\\s*(?:,|and|&)\\s*${WD})*)`),
    read: m => {
      const days = m[2].split(/\s*(?:,|and|&)\s*/i).map(dayOf);
      return rule({ freq: "WEEKLY", interval: count(m[1]), byDay: [...new Set(days)].sort((a, b) => a - b) });
    },
  },
  {
    kind: "repeat",
    // "every month on the 5th", "every 3 months on the last day", "every 5th"; a bare "every 5" is not a day.
    re: rx(
      `every\\s+(?:(?:(other|\\d{1,3})\\s+)?months?\\s+on\\s+(?:the\\s+)?)?(?:(last)\\s+day|(\\d{1,2})(st|nd|rd|th)?)(?:\\s+of\\s+the\\s+month)?`,
    ),
    read: m => {
      // Without "month on" the ordinal is required: "every 2 weeks" must not become the 2nd.
      if (!m[2] && !m[4] && !/month/i.test(m[0])) return null;
      const d = m[2] ? -1 : Number(m[3]);
      return d === -1 || (d >= 1 && d <= 31) ? rule({ freq: "MONTHLY", interval: count(m[1]), byMonthDay: d }) : null;
    },
  },
  {
    kind: "repeat",
    re: rx(`every\\s+(weekday|weekend)`),
    read: m =>
      rule({ freq: "WEEKLY", interval: 1, byDay: m[1].toLowerCase() === "weekday" ? [1, 2, 3, 4, 5] : [0, 6] }),
  },
  {
    kind: "repeat",
    re: rx(`every\\s+(?:(other|\\d{1,3})\\s+)?(day|week|month|year)s?`),
    read: m => {
      const n = count(m[1]);
      return n >= 1 ? rule({ freq: UNIT[m[2].toLowerCase() as keyof typeof UNIT], interval: n }) : null;
    },
  },
  {
    kind: "repeat",
    re: rx(`(daily|weekly|monthly|yearly|annually)`),
    read: m => {
      const w = m[1].toLowerCase();
      const freq = w === "daily" ? "DAILY" : w === "weekly" ? "WEEKLY" : w === "monthly" ? "MONTHLY" : "YEARLY";
      return rule({ freq, interval: 1 });
    },
  },

  // ---- dates ----
  { kind: "date", re: rx(`someday`), read: () => ({ when: "someday" }) },
  { kind: "date", re: rx(`(?:today|tod)`), read: (_m, t) => ({ start: t }) },
  { kind: "date", re: rx(`tonight`), read: (_m, t) => ({ start: t, evening: true }) },
  { kind: "date", re: rx(`(?:tomorrow|tmrw?)`), read: (_m, t) => ({ start: addDays(t, 1) }) },
  { kind: "date", re: rx(`next\\s+week`), read: (_m, t) => ({ start: mondayNextWeek(t) }) },
  {
    kind: "date",
    re: rx(`next\\s+month`),
    read: (_m, t) => ({ start: new Date(t.getFullYear(), t.getMonth() + 1, 1) }),
  },
  {
    kind: "date",
    re: rx(`in\\s+(\\d{1,3})\\s+(day|week|month)s?`),
    read: (m, t) => {
      const n = Number(m[1]);
      const u = m[2].toLowerCase();
      if (u === "day") return { start: addDays(t, n) };
      if (u === "week") return { start: addDays(t, 7 * n) };
      return { start: new Date(t.getFullYear(), t.getMonth() + n, Math.min(t.getDate(), 28)) };
    },
  },
  {
    kind: "date",
    re: rx(`(?:on\\s+)?(next\\s+)?(${WD})`),
    read: (m, t) => {
      const d = dayOf(m[2]);
      // "fri" = the coming Friday (never today: that is "today"); "next fri" = Friday of next week.
      return { start: m[1] ? addDays(mondayNextWeek(t), (d + 6) % 7) : nextWeekday(t, d) };
    },
  },
  {
    kind: "date",
    re: rx(`(?:on\\s+)?(${MON})\\.?\\s+(\\d{1,2})${ORD}(?:,?\\s+(\\d{4}))?`),
    read: (m, t) => {
      const d = makeDate(t, m[3] ? Number(m[3]) : undefined, monthOf(m[1]), Number(m[2]));
      return d && { start: d };
    },
  },
  {
    kind: "date",
    re: rx(`(?:on\\s+)?(\\d{1,2})${ORD}\\s+(?:of\\s+)?(${MON})\\.?(?:,?\\s+(\\d{4}))?`),
    read: (m, t) => {
      const d = makeDate(t, m[3] ? Number(m[3]) : undefined, monthOf(m[2]), Number(m[1]));
      return d && { start: d };
    },
  },
  {
    kind: "date",
    re: rx(`(?:on\\s+)?(\\d{4})-(\\d{2})-(\\d{2})`),
    read: (m, t) => {
      const d = makeDate(t, Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      return d && { start: d };
    },
  },
  {
    // Day first, as written in Brazil: 20/10 is 20 October.
    kind: "date",
    re: rx(`(?:on\\s+)?(\\d{1,2})/(\\d{1,2})(?:/(\\d{2}|\\d{4}))?`),
    read: (m, t) => {
      const d = makeDate(t, m[3] ? Number(m[3]) : undefined, Number(m[2]) - 1, Number(m[1]));
      return d && { start: d };
    },
  },

  // ---- time ----
  {
    kind: "time",
    re: rx(`(?:at\\s+)?(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm)`),
    read: m => {
      let h = Number(m[1]);
      const min = Number(m[2] ?? 0);
      if (h < 1 || h > 12 || min > 59) return null;
      if (m[3].toLowerCase() === "pm" && h < 12) h += 12;
      if (m[3].toLowerCase() === "am" && h === 12) h = 0;
      return { time: `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}` };
    },
  },
  {
    kind: "time",
    re: rx(`(?:at\\s+)?(\\d{1,2}):(\\d{2})|at\\s+(\\d{1,2})`),
    read: m => {
      const h = Number(m[1] ?? m[3]);
      const min = Number(m[2] ?? 0);
      if (h > 23 || min > 59) return null;
      return { time: `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}` };
    },
  },

  // ---- the rest ----
  { kind: "evening", re: rx(`(?:this\\s+)?evening`), read: () => ({ evening: true }) },
  {
    kind: "list",
    re: /(?<!\S)#([\p{L}\p{N}_-]+)/gu,
    read: m => {
      const id = slugify(m[1]);
      return id === "untitled" ? null : { list: id, listName: m[1] };
    },
  },
  {
    kind: "priority",
    re: /(?<!\S)!([123])(?!\S)/g,
    read: m => ({ priority: Number(m[1]) as 1 | 2 | 3 }),
  },
];

export function parseQuickAdd(text: string, today: Date = new Date()): QuickAdd {
  today = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const spans: Span[] = [];
  const taken = new Set<TokenKind>();
  const v: Value = {};

  for (const mt of MATCHERS) {
    if (taken.has(mt.kind)) continue;
    mt.re.lastIndex = 0;
    for (let m; (m = mt.re.exec(text));) {
      const start = m.index;
      const end = start + m[0].length;
      if (spans.some(s => start < s.end && end > s.start)) continue;
      const got = mt.read(m, today);
      if (!got) continue;
      if (got.evening && v.evening) delete got.evening;
      Object.assign(v, got);
      spans.push({ start, end, kind: mt.kind });
      taken.add(mt.kind);
      break;
    }
  }
  spans.sort((a, b) => a.start - b.start);

  let title = "";
  let at = 0;
  for (const s of spans) {
    title += text.slice(at, s.start) + " ";
    at = s.end;
  }
  title = (title + text.slice(at)).replace(/\s+/g, " ").replace(/^[\s,;–-]+|[\s,;–-]+$/g, "");

  const out: QuickAdd = { title, spans };
  if (v.when === "someday") out.when = "someday";
  if (v.repeat) {
    out.repeat = v.repeat;
    // A repeating task starts on its first date: "every monday" → the coming Monday (or today).
    const r = parseRule(v.repeat)!;
    if (!v.start && !out.when) v.start = firstOnOrAfter(r, today);
    if (v.start) out.repeat = formatRule(pinRule(r, v.start));
  }
  // A time or "evening" alone means today.
  if (!v.start && !out.when && (v.time || v.evening)) v.start = today;
  if (v.start) out.when = isoDate(v.start);
  if (v.evening && out.when !== "someday") out.evening = true;
  if (v.time) out.time = v.time;
  if (v.list) {
    out.list = v.list;
    out.listName = v.listName;
  }
  if (v.priority) out.priority = v.priority;
  return out;
}
