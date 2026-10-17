import { addDays, isoDate, slugify } from "./dates";
import { firstOnOrAfter, formatRule, parseRule, pinRule, type Rule } from "./recur";
import { lang } from "../i18n";

// One-line quick add, Todoist style (SPEC 5.3): "Buy milk tomorrow at 5pm #home !1 every week".
// Portuguese is understood too, whatever the app language: "Comprar leite amanhã às 17h toda semana".
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

// Portuguese. Short forms that are common words ("ter" = to have, "sex", "dom") need the full
// name; plurals ("todas as segundas") only count after "todo/toda".
const WDP =
  "(?:segundas?(?:-feiras?)?|seg|ter[çc]as?(?:-feiras?)?|quartas?(?:-feiras?)?|qua|quintas?(?:-feiras?)?|qui|sextas?(?:-feiras?)?|s[áa]bados?|s[áa]b|domingos?)";
const MONTHS_PT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MONP =
  "(?:jan(?:eiro)?|fev(?:ereiro)?|mar(?:[çc]o)?|abr(?:il)?|mai(?:o)?|jun(?:ho)?|jul(?:ho)?|ago(?:sto)?|set(?:embro)?|out(?:ubro)?|nov(?:embro)?|dez(?:embro)?)";
// Joins days in a list: "mon, thu", "mon and thu", "seg e qui".
const AND = "(?:\\s*(?:,|&)\\s*|\\s+(?:and|e)\\s+)";
const N = "(\\d{1,3}|other|dois|duas|tr[êe]s)";

const plain = (w: string) => w.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const dayOf = (word: string) => {
  const w = plain(word).slice(0, 3);
  const en = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"].indexOf(w);
  return en >= 0 ? en : ["dom", "seg", "ter", "qua", "qui", "sex", "sab"].indexOf(w);
};
const monthOf = (word: string) => {
  const w = plain(word).slice(0, 3);
  const en = MONTHS.indexOf(w);
  return en >= 0 ? en : MONTHS_PT.indexOf(w);
};
const daysOf = (list: string) => [...new Set(list.split(new RegExp(AND, "i")).map(dayOf))].sort((a, b) => a - b);

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
const count = (s: string | undefined) => {
  const w = plain(s ?? "");
  return !w ? 1 : w === "other" || w === "dois" || w === "duas" ? 2 : w === "tres" ? 3 : Number(w);
};
/** "dias", "semana", "meses"… → the rule frequency. */
const unitPt = (w: string) => {
  const u = plain(w);
  return u.startsWith("d") ? "DAILY" : u.startsWith("s") ? "WEEKLY" : u.startsWith("m") ? "MONTHLY" : "YEARLY";
};
const time = (h: number, min: number): Value | null =>
  h > 23 || min > 59 ? null : { time: `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}` };

/** Text typed in the task's Repeat field: "every"/"toda" is added when missing ("monday" → "every monday"). */
const REPEAT_START = /^(?:every|tod[ao]s?|a\s+cada)\b|^(?:daily|weekly|monthly|yearly|annually|diariamente|semanalmente|mensalmente|anualmente)\b/i;
export const asRepeat = (text: string) => (REPEAT_START.test(text) ? text : `${lang === "pt-BR" ? "toda" : "every"} ${text}`);

const MATCHERS: Matcher[] = [
  // ---- repeat (before dates, so "every monday" is not read as "monday") ----
  {
    kind: "repeat",
    re: rx(`every\\s+(?:(?:(other|\\d{1,3})\\s+)?weeks?\\s+on\\s+)?(${WD}(?:${AND}${WD})*)`),
    read: m => rule({ freq: "WEEKLY", interval: count(m[1]), byDay: daysOf(m[2]) }),
  },
  {
    // "toda segunda", "todas as seg e qui", "a cada 2 semanas na sexta"
    kind: "repeat",
    re: rx(`(?:tod[ao]s?\\s+(?:[ao]s\\s+)?|a\\s+cada\\s+${N}\\s+semanas?\\s*(?:,\\s*|:\\s*|n[ao]s?\\s+|[àa]s?\\s+)?)(${WDP}(?:${AND}${WDP})*)`),
    read: m => rule({ freq: "WEEKLY", interval: count(m[1]), byDay: daysOf(m[2]) }),
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
    // "todo mês no dia 5", "a cada 3 meses no último dia", "todo dia 5 (do mês)", "todo último dia do mês"
    kind: "repeat",
    re: rx(
      `(?:(?:todo\\s+m[êe]s|a\\s+cada\\s+${N}\\s+meses)\\s+(?:n[oa]\\s+)?(?:dia\\s+(\\d{1,2})|([úu]ltimo)\\s+dia)|todo\\s+(?:dia\\s+(\\d{1,2})|([úu]ltimo)\\s+dia)(?:\\s+d[eo]\\s+(?:cada\\s+)?m[êe]s)?)`,
    ),
    read: m => {
      const d = m[3] || m[5] ? -1 : Number(m[2] ?? m[4]);
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
    // "todo dia útil", "todos os dias úteis", "todo fim de semana"
    kind: "repeat",
    re: rx(`tod[oa]s?\\s+(?:os\\s+)?(?:(dias?\\s+[úu]t(?:il|eis))|fins?\\s+de\\s+semana)`),
    read: m => rule({ freq: "WEEKLY", interval: 1, byDay: m[1] ? [1, 2, 3, 4, 5] : [0, 6] }),
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
    // "todo dia", "toda semana", "todos os meses", "a cada 3 dias"
    kind: "repeat",
    re: rx(`(?:tod[ao]s?\\s+(?:[ao]s\\s+)?|a\\s+cada\\s+${N}\\s+)(dias?|semanas?|m[êe]s|meses|anos?)`),
    read: m => {
      const n = count(m[1]);
      return n >= 1 ? rule({ freq: unitPt(m[2]), interval: n }) : null;
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
  {
    kind: "repeat",
    re: rx(`(diariamente|semanalmente|mensalmente|anualmente)`),
    read: m => rule({ freq: unitPt(m[1]), interval: 1 }),
  },

  // ---- dates ----
  { kind: "date", re: rx(`(?:someday|algum\\s+dia)`), read: () => ({ when: "someday" }) },
  { kind: "date", re: rx(`(?:hoje\\s+[àa]\\s+noite|esta\\s+noite)`), read: (_m, t) => ({ start: t, evening: true }) },
  { kind: "date", re: rx(`(?:today|tod|hoje|hj)`), read: (_m, t) => ({ start: t }) },
  { kind: "date", re: rx(`tonight`), read: (_m, t) => ({ start: t, evening: true }) },
  { kind: "date", re: rx(`depois\\s+de\\s+amanh[ãa]`), read: (_m, t) => ({ start: addDays(t, 2) }) },
  { kind: "date", re: rx(`(?:tomorrow|tmrw?|amanh[ãa])`), read: (_m, t) => ({ start: addDays(t, 1) }) },
  {
    kind: "date",
    re: rx(`(?:next\\s+week|pr[óo]xima\\s+semana|semana\\s+que\\s+vem)`),
    read: (_m, t) => ({ start: mondayNextWeek(t) }),
  },
  {
    kind: "date",
    re: rx(`(?:next\\s+month|pr[óo]ximo\\s+m[êe]s|m[êe]s\\s+que\\s+vem)`),
    read: (_m, t) => ({ start: new Date(t.getFullYear(), t.getMonth() + 1, 1) }),
  },
  {
    kind: "date",
    re: rx(`(?:em|daqui\\s+a)\\s+(\\d{1,3})\\s+(dias?|semanas?|m[êe]s|meses)`),
    read: (m, t) => {
      const n = Number(m[1]);
      const u = unitPt(m[2]);
      if (u === "DAILY") return { start: addDays(t, n) };
      if (u === "WEEKLY") return { start: addDays(t, 7 * n) };
      return { start: new Date(t.getFullYear(), t.getMonth() + n, Math.min(t.getDate(), 28)) };
    },
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
    // "na sexta", "próxima sexta", "sexta que vem": the coming one, as usually meant in Brazil.
    // "segunda" … "sexta" alone are also ordinals ("segunda via"): they need one of those words.
    kind: "date",
    re: rx(`((?:n[ao]\\s+)?(?:pr[óo]xim[ao]\\s+)?)(${WDP})(\\s+que\\s+vem)?`),
    read: (m, t) => {
      if (/s$/i.test(m[2])) return null;
      if (!m[1] && !m[3] && /^(segunda|terca|quarta|quinta|sexta)$/.test(plain(m[2]))) return null;
      return { start: nextWeekday(t, dayOf(m[2])) };
    },
  },
  {
    // "20 de outubro", "dia 5 de dez de 2027"
    kind: "date",
    re: rx(`(?:(?:n?o\\s+)?dia\\s+)?(\\d{1,2})\\s+de\\s+(${MONP})\\.?(?:\\s+de\\s+(\\d{4}))?`),
    read: (m, t) => {
      const d = makeDate(t, m[3] ? Number(m[3]) : undefined, monthOf(m[2]), Number(m[1]));
      return d && { start: d };
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
    re: rx(`(?:(?:on|em|dia)\\s+)?(\\d{4})-(\\d{2})-(\\d{2})`),
    read: (m, t) => {
      const d = makeDate(t, Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      return d && { start: d };
    },
  },
  {
    // Day first, as written in Brazil: 20/10 is 20 October.
    kind: "date",
    re: rx(`(?:(?:on|em|dia)\\s+)?(\\d{1,2})/(\\d{1,2})(?:/(\\d{2}|\\d{4}))?`),
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
    // "17:30", "at 9", "às 9", "às 17h", "17h30", "9h"
    kind: "time",
    re: rx(`(?:(?:at|[àa]s)\\s+)?(\\d{1,2}):(\\d{2})|(?:(?:at|[àa]s)\\s+)?(\\d{1,2})h(\\d{2})?|(?:at|às)\\s+(\\d{1,2})`),
    read: m => time(Number(m[1] ?? m[3] ?? m[5]), Number(m[2] ?? m[4] ?? 0)),
  },
  { kind: "time", re: rx(`(?:ao\\s+)?meio[-\\s]dia`), read: () => time(12, 0) },

  // ---- the rest ----
  { kind: "evening", re: rx(`(?:this\\s+)?evening|(?:à|de|esta)\\s+noite`), read: () => ({ evening: true }) },
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
