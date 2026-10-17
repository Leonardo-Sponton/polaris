import { isoDate, slugify } from "./dates";
import { titleOf } from "./frontmatter";
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

/** Opening an idea counts as seeing it (used by "resurface old ideas"). Does not touch `modified`. */
export async function markSeen(notes: Notes, path: string, today = isoDate()) {
  const n = await notes.load(path);
  if (n.data.last_seen === today) return;
  await notes.save(n, { ...n.data, last_seen: today }, n.body, { touch: false });
}
