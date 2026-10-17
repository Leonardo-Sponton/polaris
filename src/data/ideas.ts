import { addDays, isoDate, parseLocal, slugify } from "./dates";
import { isWord, word, type Words } from "../i18n";
import { titleOf } from "./frontmatter";
import type { Note, Notes } from "./notes";
import { joinTitle } from "./todo";

// Ideas (SPEC 5.4): a title and a free draft first; templates only suggest optional sections.
// Lifecycle: draft → maturing → project (stage 6) or archived (with the reason it did not work).

export type IdeaStatus = "draft" | "maturing" | "project" | "archived";
export type Template = "blank" | "software" | "business" | "personal";

export const STATUSES: { id: IdeaStatus }[] = [{ id: "draft" }, { id: "maturing" }, { id: "project" }, { id: "archived" }];

export const TEMPLATES: { id: Template }[] = [{ id: "blank" }, { id: "software" }, { id: "business" }, { id: "personal" }];

/** The helper sections a non-blank template suggests (SPEC 5.4, Q6), in both languages. */
export const OPTIONAL_SECTIONS: Words[] = [
  { en: "Problem", pt: "Problema" },
  { en: "For whom", pt: "Para quem" },
  { en: "Solution", pt: "Solução" },
  { en: "Why now", pt: "Por que agora" },
  { en: "Risks", pt: "Riscos" },
];

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

/** Optional sections the template suggests that the body does not have yet (named in the app's language). */
export function missingSections(template: Template, body: string): string[] {
  if (template === "blank") return [];
  const have = sectionsOf(body);
  return OPTIONAL_SECTIONS.filter(s => !have.some(h => isWord(s, h))).map(word);
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

/** Opening an idea counts as seeing it (used by "resurface old ideas"). Does not touch `modified`. */
export async function markSeen(notes: Notes, path: string, today = isoDate()): Promise<boolean> {
  const n = await notes.load(path);
  if (n.data.last_seen === today) return false;
  await notes.save(n, { ...n.data, last_seen: today }, n.body, { touch: false });
  return true;
}

// Viability checklist (SPEC 5.4): yes / no / unsure answers, score = number of "yes".

export type Answer = "yes" | "no" | "unsure";

/** The questions' words are in i18n (ideas.questions), by id. */
export const QUESTIONS: { id: string }[] = [
  { id: "problem-real" },
  { id: "who" },
  { id: "would-use" },
  { id: "better" },
  { id: "can-build" },
  { id: "cost-ok" },
  { id: "still-want" },
  { id: "riskiest-known" },
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
export const RESULTS: { id: Result }[] = [{ id: "untested" }, { id: "confirmed" }, { id: "rejected" }];

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
