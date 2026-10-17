import { addDays, isoDate, parseLocal, slugify } from "./dates";
import { titleOf, type Data } from "./frontmatter";
import type { Note, Notes } from "./notes";
import { joinTitle } from "./todo";

// Ideas (SPEC 5.4): a title and a free draft first; templates only suggest optional sections.
// Lifecycle: draft → maturing → project (stage 6) or archived (with the reason it did not work).

export type IdeaStatus = "draft" | "maturing" | "project" | "archived";
export type Template = "blank" | "software" | "business" | "personal";

export const STATUSES: { id: IdeaStatus; label: string }[] = [
  { id: "draft", label: "Draft" },
  { id: "maturing", label: "Maturing" },
  { id: "project", label: "Became project" },
  { id: "archived", label: "Archived" },
];

export const TEMPLATES: { id: Template; label: string }[] = [
  { id: "blank", label: "Blank" },
  { id: "software", label: "Software" },
  { id: "business", label: "Business" },
  { id: "personal", label: "Personal" },
];

/** The helper sections a non-blank template suggests (SPEC 5.4, Q6). */
export const OPTIONAL_SECTIONS = ["Problem", "For whom", "Solution", "Why now", "Risks"];

export interface Idea {
  path: string;
  note: Note;
  title: string;
  status: IdeaStatus;
  template: Template;
  tags: string[];
  created: string;
  modified: string;
  lastSeen?: string;
  archivedReason: string;
  project?: string;
}

const pick = <T extends string>(value: unknown, list: { id: T }[], fallback: T): T =>
  list.some(x => x.id === value) ? (value as T) : fallback;

const str = (v: unknown) => (v === undefined || v === null ? "" : String(v));

export function toIdea(note: Note): Idea {
  const d = note.data;
  return {
    path: note.path,
    note,
    title: titleOf(note.body),
    status: pick(d.status, STATUSES, "draft"),
    template: pick(d.template, TEMPLATES, "blank"),
    tags: Array.isArray(d.tags) ? d.tags.map(String) : [],
    created: str(d.created),
    modified: str(d.modified ?? d.created),
    lastSeen: d.last_seen ? str(d.last_seen) : undefined,
    archivedReason: str(d.archived_reason),
    project: d.project ? str(d.project) : undefined,
  };
}

/** Every idea, last changed first. */
export async function loadIdeas(notes: Notes, onError?: (path: string) => void): Promise<Idea[]> {
  const list = await notes.loadDir("ideas", p => onError?.(p));
  return list
    .filter(n => n.data.type === undefined || n.data.type === "idea")
    .map(toIdea)
    .sort((a, b) => b.modified.localeCompare(a.modified) || b.path.localeCompare(a.path));
}

export async function createIdea(notes: Notes, title: string, template: Template = "blank", now = new Date()) {
  const path = await notes.freePath("ideas", `${isoDate(now).replace(/-/g, "")}-${slugify(title)}`);
  const data = { type: "idea", status: "draft", template, last_seen: isoDate(now) };
  return notes.create(path, data, joinTitle(title, ""));
}

/** The "## " headings of a body, in order. */
export function sectionsOf(body: string): string[] {
  return [...body.matchAll(/^##[ \t]+(.+?)[ \t]*#*[ \t]*$/gm)].map(m => m[1].trim());
}

/** Optional sections the template suggests that the body does not have yet. */
export function missingSections(template: Template, body: string): string[] {
  if (template === "blank") return [];
  const have = new Set(sectionsOf(body).map(s => s.toLowerCase()));
  return OPTIONAL_SECTIONS.filter(s => !have.has(s.toLowerCase()));
}

/** Adds an empty "## name" section at the end of the text, leaving the caret line after it. */
export function addSection(text: string, name: string): string {
  const base = text.replace(/\s+$/, "");
  return `${base}${base ? "\n\n" : ""}## ${name}\n\n`;
}

/** Tags typed as "life, study #app" → ["life", "study", "app"]. */
export function parseTags(text: string): string[] {
  const out: string[] = [];
  for (const t of text.split(/[,\s]+/)) {
    const tag = t.replace(/^#+/, "").trim().toLowerCase();
    if (tag && !out.includes(tag)) out.push(tag);
  }
  return out;
}

/** Header changes for each lifecycle step. */
export const archivePatch = (reason: string) => ({ status: "archived", archived_reason: reason.trim() });
/** Reopening an archived idea sends it back to Maturing and drops the reason. */
export const reopenPatch = () => ({ status: "maturing", archived_reason: undefined });

/** Changes an idea's header from outside its screen (the hold menu). Returns the old values of the
 *  changed keys, so passing them back undoes it. */
export async function updateIdea(notes: Notes, path: string, patch: Data): Promise<Data> {
  const n = await notes.load(path);
  const old: Data = {};
  for (const k of Object.keys(patch)) old[k] = n.data[k];
  await notes.save(n, { ...n.data, ...patch }, n.body);
  return old;
}

/** Opening an idea counts as seeing it (used by "resurface old ideas"). Does not touch `modified`. */
export async function markSeen(notes: Notes, path: string, today = isoDate()): Promise<boolean> {
  const n = await notes.load(path);
  if (n.data.last_seen === today) return false;
  await notes.save(n, { ...n.data, last_seen: today }, n.body, { touch: false });
  return true;
}

// Viability checklist (SPEC 5.4): yes / no / unsure answers, score = number of "yes".

export type Answer = "yes" | "no" | "unsure";

export const QUESTIONS: { id: string; text: string }[] = [
  { id: "problem-real", text: "Is the problem real (did I see it happen, not just imagine it)?" },
  { id: "who", text: "Do I know who has it?" },
  { id: "would-use", text: "Would they use (or pay for) a solution?" },
  { id: "better", text: "Is my solution clearly better than what they use today?" },
  { id: "can-build", text: "Can I build a first version with my current time and skills?" },
  { id: "cost-ok", text: "Is the cost acceptable?" },
  { id: "still-want", text: "Do I still want to do it after a few days?" },
  { id: "riskiest-known", text: "Do I know the riskiest assumption and how to test it?" },
];

/** Older YAML readers turn an unquoted yes/no into true/false: both are accepted. */
function answer(v: unknown): Answer | undefined {
  if (v === true || v === "yes") return "yes";
  if (v === false || v === "no") return "no";
  if (v === "unsure") return "unsure";
  return undefined;
}

export function answersOf(data: Record<string, unknown>): Record<string, Answer> {
  const c = data.checklist;
  const out: Record<string, Answer> = {};
  if (c && typeof c === "object" && !Array.isArray(c)) {
    for (const [k, v] of Object.entries(c)) {
      const a = answer(v);
      if (a) out[k] = a;
    }
  }
  return out;
}

export function score(answers: Record<string, Answer>) {
  const yes = QUESTIONS.filter(q => answers[q.id] === "yes").length;
  const answered = QUESTIONS.filter(q => answers[q.id]).length;
  return { yes, answered, total: QUESTIONS.length, viable: yes === QUESTIONS.length };
}

/** Header change for one answer; tapping the chosen answer again clears it. */
export function answerPatch(data: Record<string, unknown>, id: string, a: Answer) {
  const next: Record<string, unknown> = { ...((data.checklist as object) ?? {}) };
  if (answer(next[id]) === a) delete next[id];
  else next[id] = a;
  return { checklist: Object.keys(next).length ? next : undefined };
}

// Riskiest assumptions (SPEC 5.4, Lean Canvas): what must be true, how to test it, the result.

export type Result = "untested" | "confirmed" | "rejected";
export const RESULTS: { id: Result; label: string }[] = [
  { id: "untested", label: "Untested" },
  { id: "confirmed", label: "Confirmed" },
  { id: "rejected", label: "Rejected" },
];

export interface Assumption {
  text: string;
  test: string;
  result: Result;
  notes: string;
}

export function assumptionsOf(data: Record<string, unknown>): Assumption[] {
  if (!Array.isArray(data.assumptions)) return [];
  return data.assumptions
    .filter(a => a && typeof a === "object")
    .map(a => ({
      text: str(a.text),
      test: str(a.test),
      result: pick(a.result, RESULTS, "untested"),
      notes: str(a.notes),
    }));
}

/** Header value for a list of assumptions (empty notes are not written). */
export const assumptionsPatch = (list: Assumption[]) => ({
  assumptions: list.length
    ? list.map(a => ({ text: a.text, test: a.test, result: a.result, ...(a.notes ? { notes: a.notes } : {}) }))
    : undefined,
});

// Resurface (SPEC 5.4): an idea in draft/maturing not opened for 14+ days comes back on Today.

export const RESURFACE_DAYS = 14;

/** The idea to show on Today: the one seen longest ago, if it was 14+ days ago. */
export function resurface(ideas: Idea[], today = isoDate()): Idea | undefined {
  const t = parseLocal(today)!;
  const limit = isoDate(addDays(t, -RESURFACE_DAYS));
  const seen = (i: Idea) => (i.lastSeen ?? i.created).slice(0, 10);
  return ideas
    .filter(i => (i.status === "draft" || i.status === "maturing") && seen(i) && seen(i) <= limit)
    .sort((a, b) => seen(a).localeCompare(seen(b)) || a.path.localeCompare(b.path))[0];
}
