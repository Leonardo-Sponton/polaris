import type { FileInfo } from "../storage/types";
import { parseCards, statesOf, isDue, writeState, type Card, type CardState } from "./cards";
import { isoDate, slugify, stamp } from "./dates";
import { parse, titleOf, type Data } from "./frontmatter";
import { itemParts } from "./inbox";
import type { Note, Notes } from "./notes";
import { CLASS_RESULTS, loadAssignments, num, slotsOf, toExam, type Assignment, type ClassResult, type Exam, type Slot } from "./school";

// Study: one folder per subject (JDBC, Docker, a school course…), study/<slug>/:
//   subject.md            the subject: title, group, parent subject (the tree), exam date in the
//                         header; the body is "in my own words", the subject explained as if
//                         teaching it (Feynman). A school subject also has course, semester and
//                         class fields (data/school); its body is the syllabus.
//   materials/<name>.md   what is studied from: a handout an AI wrote, a book, a course. The whole
//                         text lives in the body; its headings are the chapters, and the header
//                         keeps which chapters are read (`done`) and where reading stopped (`at`)
//   notes/<stamp>.md      study notes ("# Title"), optionally about one chapter of a material;
//                         flashcards inside them (data/cards) keep their review state in the header.
//                         `kind: class` (with `date`) = notes of one class; `kind: cards` = a note
//                         holding only flashcards (added by hand or made by the AI from a material)
//   links.md              links to read or watch (videos, docs, articles): one Markdown list item
//                         per link, "- [Title](https://…) — note"
//   assignments/, exams/  school subjects only (data/school)
// study/_groups.md keeps the personal groups (their order, and groups with no subject yet).
// Notes link to each other with [[Title]] (a note, a material or a subject, by title).

export type MaterialKind = "handout" | "book" | "course" | "video" | "article" | "other";
export const MATERIAL_KINDS: MaterialKind[] = ["handout", "book", "course", "video", "article", "other"];

export const SUBJECT_FILE = "subject.md";
export const LINKS_FILE = "links.md";
export const GROUPS_PATH = "study/_groups.md";

export interface StudyLink {
  title: string;
  url: string;
  note: string;
}

export interface Chapter {
  /** 0 = the text before the first chapter heading; 1, 2… = the headings in order. */
  n: number;
  title: string;
  /** Start and end (exclusive) in the body. */
  from: number;
  to: number;
}

export interface Material {
  path: string;
  /** File name without .md: what a study note points to in `material:`. */
  name: string;
  title: string;
  kind: MaterialKind;
  source: string;
  url: string;
  chapters: Chapter[];
  done: number[];
  /** The chapter where reading stopped, or null. */
  at: number | null;
  modified: string;
}

export type StudyNoteKind = "note" | "class" | "cards";

export interface StudyNote {
  path: string;
  kind: StudyNoteKind;
  /** Day of the class (kind class), yyyy-mm-dd. */
  date: string;
  title: string;
  preview: string;
  material: string;
  chapter: number | null;
  cards: Card[];
  states: Map<string, CardState>;
  /** Names this note links to with [[…]]. */
  links: string[];
  /** Title and body folded (no accents, lowercase), for the notes filter. */
  folded: string;
  created: string;
  modified: string;
}

export interface Subject {
  path: string;
  dir: string;
  /** Folder name: what a child subject points to in `parent:`. */
  slug: string;
  title: string;
  group: string;
  parent: string;
  exam: string;
  /** School: the course id (data/school) or "" for a personal subject. */
  course: string;
  semester: number | null;
  teacher: string;
  room: string;
  hoursWeek: number | null;
  /** Total class hours of the term, when known. */
  hoursTotal: number | null;
  schedule: Slot[];
  result: ClassResult;
  /** Hours of class missed. */
  absences: number;
  assignments: Assignment[];
  exams: Exam[];
  /** The "in my own words" text is not empty. */
  hasSummary: boolean;
  materials: Material[];
  notes: StudyNote[];
  links: StudyLink[];
  modified: string;
}

const str = (v: unknown) => (v === undefined || v === null ? "" : String(v));
const pick = <T extends string>(v: unknown, list: T[], fallback: T): T => (list.includes(v as T) ? (v as T) : fallback);
const nums = (v: unknown): number[] =>
  Array.isArray(v) ? [...new Set(v.map(Number).filter(n => Number.isInteger(n) && n >= 0))].sort((a, b) => a - b) : [];
function int(v: unknown): number | null {
  const n = typeof v === "number" ? v : parseInt(str(v), 10);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

export const subjectDirOf = (path: string) => path.split("/").slice(0, 2).join("/");
export const isSubjectPath = (p: string) => /^study\/[^/]+\/subject\.md$/.test(p);
export const isMaterialPath = (p: string) => /^study\/[^/]+\/materials\/[^/]+\.md$/.test(p);
export const isStudyNotePath = (p: string) => /^study\/[^/]+\/notes\/[^/]+\.md$/.test(p);
export const isLinksPath = (p: string) => /^study\/[^/]+\/links\.md$/.test(p);

// ---- Links ----

const LINK_ITEM = /^\s*[-*+]\s+(?:\[((?:\\.|[^\]\\])*)\]\(<?([^)\s>]+)>?\)|<?(https?:\/\/[^\s>]+)>?)\s*(?:[—–-]\s*(.*))?$/;

/** The links of a links.md body: list items "- [Title](url) — note" or "- https://…"; anything else is ignored. */
export function parseLinks(body: string): StudyLink[] {
  const out: StudyLink[] = [];
  for (const l of body.split("\n")) {
    const m = LINK_ITEM.exec(l);
    if (m) out.push({ title: (m[1] ?? "").replace(/\\([[\]])/g, "$1").trim(), url: m[2] ?? m[3], note: (m[4] ?? "").trim() });
  }
  return out;
}

export function linksBody(list: StudyLink[]): string {
  const item = (l: StudyLink) => `- [${(l.title || l.url).replace(/([[\]])/g, "\\$1")}](${l.url})${l.note ? ` — ${l.note.replace(/\n/g, " ")}` : ""}`;
  return list.length ? `${list.map(item).join("\n")}\n` : "";
}

/** Writes a subject's links (links.md, made on the first link). */
export async function saveLinks(notes: Notes, subjectDir: string, list: StudyLink[]): Promise<void> {
  const path = `${subjectDir}/${LINKS_FILE}`;
  if (await notes.exists(path)) {
    const n = await notes.load(path);
    await notes.save(n, n.data, linksBody(list));
  } else await notes.create(path, { type: "links" }, linksBody(list));
}

// ---- Groups (personal) ----

/** The saved group order (study/_groups.md); groups only used by subjects come after it. */
export async function loadGroups(notes: Notes): Promise<string[]> {
  if (!(await notes.exists(GROUPS_PATH))) return [];
  const d = (await notes.load(GROUPS_PATH)).data.groups;
  return Array.isArray(d) ? [...new Set(d.map(x => str(x).trim()).filter(Boolean))] : [];
}

export async function saveGroups(notes: Notes, groups: string[]): Promise<void> {
  const list = [...new Set(groups.map(g => g.trim()).filter(Boolean))];
  if (await notes.exists(GROUPS_PATH)) {
    const n = await notes.load(GROUPS_PATH);
    await notes.save(n, { ...n.data, groups: list }, n.body);
  } else await notes.create(GROUPS_PATH, { type: "groups", groups: list }, "");
}

/** Every personal group: the saved order first, then the others in use, A–Z. */
export function allGroups(saved: string[], subjects: Subject[]): string[] {
  const used = groupsOf(subjects.filter(s => !isSchool(s))).filter(g => !saved.includes(g));
  return [...saved, ...used];
}

/** Renames a group (every subject in it follows). Merges into `to` when that group exists. */
export async function renameGroup(notes: Notes, subjects: Subject[], saved: string[], from: string, to: string): Promise<void> {
  to = to.trim();
  if (!to || to === from) return;
  for (const s of subjects) if (!isSchool(s) && s.group === from) await notes.patchHeader(s.path, { group: to });
  const all = allGroups(saved, subjects);
  await saveGroups(notes, all.includes(to) ? all.filter(g => g !== from) : all.map(g => (g === from ? to : g)));
}

/** Removes a group; its subjects stay, with no group. */
export async function deleteGroup(notes: Notes, subjects: Subject[], saved: string[], name: string): Promise<void> {
  for (const s of subjects) if (!isSchool(s) && s.group === name) await notes.patchHeader(s.path, { group: undefined });
  await saveGroups(notes, allGroups(saved, subjects).filter(g => g !== name));
}
export const materialName = (path: string) => path.slice(path.lastIndexOf("/") + 1).replace(/\.md$/, "");

/**
 * The chapters of a text: the headings of the biggest level used at least twice (so a lone
 * "# Title" on top is not a chapter and "## Chapter 1", "## Chapter 2"… are). Headings inside
 * code blocks are skipped. Text before the first chapter is chapter 0 when it has anything
 * besides a title line. A text with no such headings is one chapter.
 */
export function chaptersOf(body: string): Chapter[] {
  const heads: { level: number; title: string; at: number }[] = [];
  let fence = false;
  let pos = 0;
  for (const line of body.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    else if (!fence) {
      const m = /^(#{1,6})[ \t]+(.+?)[ \t#]*$/.exec(line);
      if (m) heads.push({ level: m[1].length, title: m[2].trim(), at: pos });
    }
    pos += line.length + 1;
  }
  let level = 0;
  for (let l = 1; l <= 6 && !level; l++) if (heads.filter(h => h.level === l).length >= 2) level = l;
  const tops = heads.filter(h => h.level === level);
  if (!level) return body.trim() ? [{ n: 0, title: titleOf(body), from: 0, to: body.length }] : [];

  const out: Chapter[] = [];
  const intro = body.slice(0, tops[0].at);
  if (intro.replace(/^#[ \t]+.*$/m, "").trim()) out.push({ n: 0, title: titleOf(intro), from: 0, to: tops[0].at });
  tops.forEach((h, i) => out.push({ n: i + 1, title: h.title, from: h.at, to: tops[i + 1]?.at ?? body.length }));
  return out;
}

export function toMaterial(n: Note): Material {
  const d = n.data;
  return {
    path: n.path,
    name: materialName(n.path),
    title: str(d.title) || titleOf(n.body) || materialName(n.path),
    kind: pick(d.kind, MATERIAL_KINDS, "handout"),
    source: str(d.source),
    url: str(d.url),
    chapters: chaptersOf(n.body),
    done: nums(d.done),
    at: int(d.at),
    modified: str(d.modified ?? d.created),
  };
}

export function toStudyNote(n: Note): StudyNote {
  const { title, rest } = itemParts(n.body);
  const preview = rest
    .split("\n")
    .map(l => l.replace(/^\s*(#+|>|[-*+]( \[[ xX]\])?|\d+\.)\s*/, "").replace(/[*_~`]/g, "").trim())
    .filter(Boolean)
    .join(" · ")
    .slice(0, 140);
  const kind = n.data.kind === "class" || n.data.kind === "cards" ? n.data.kind : "note";
  return {
    path: n.path,
    kind,
    date: str(n.data.date).slice(0, 10),
    title,
    preview,
    material: str(n.data.material),
    chapter: int(n.data.chapter),
    cards: parseCards(n.body),
    states: statesOf(n.data),
    links: linksIn(n.body),
    folded: fold(`${title}\n${n.body}`),
    created: str(n.data.created),
    modified: str(n.data.modified ?? n.data.created),
  };
}

export const STUDY_NOTE_SORTS = ["chapter", "modified", "newest", "oldest", "title"] as const;
export type StudyNoteSort = (typeof STUDY_NOTE_SORTS)[number];

/** What the notes list of a subject keeps: all, the notes on one material, the free ones, or those with cards. */
export type StudyNoteOnly = "" | "free" | "cards" | `m:${string}`;

/** The notes of a subject that have every word of `query`, kept by `only`, in the chosen order.
 *  "chapter" follows the materials (as listed) and their chapters, free notes last, each by creation. */
export function filterStudyNotes(s: Subject, query: string, only: StudyNoteOnly, sort: StudyNoteSort): StudyNote[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  const list = s.notes.filter(
    n =>
      (!words.length || words.every(w => n.folded.includes(w))) &&
      (only === "" ||
        (only === "free" ? !n.material : only === "cards" ? n.cards.length > 0 : n.material === only.slice(2))),
  );
  const byCreated = (a: StudyNote, b: StudyNote) => a.created.localeCompare(b.created) || a.path.localeCompare(b.path);
  const at = new Map(s.materials.map((m, i) => [m.name, i]));
  const place = (n: StudyNote) => (n.material ? (at.get(n.material) ?? s.materials.length) : s.materials.length + 1);
  const cmp: Record<StudyNoteSort, (a: StudyNote, b: StudyNote) => number> = {
    chapter: (a, b) => place(a) - place(b) || (a.chapter ?? 1e9) - (b.chapter ?? 1e9) || byCreated(a, b),
    modified: (a, b) => b.modified.localeCompare(a.modified) || byCreated(a, b),
    newest: (a, b) => byCreated(b, a),
    oldest: byCreated,
    title: (a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }) || byCreated(a, b),
  };
  return list.sort(cmp[sort]);
}

/** Read chapters out of the chapters a material has (a `done` number that no longer exists is not counted). */
export function progress(m: Material): { read: number; total: number } {
  const ids = new Set(m.chapters.map(c => c.n));
  return { read: m.done.filter(n => ids.has(n)).length, total: m.chapters.length };
}

export function subjectProgress(s: Subject): { read: number; total: number } {
  return s.materials.map(progress).reduce((a, b) => ({ read: a.read + b.read, total: a.total + b.total }), { read: 0, total: 0 });
}

export interface DueCard {
  card: Card;
  state?: CardState;
  notePath: string;
  noteTitle: string;
  subject: string;
  subjectTitle: string;
}

/** Cards to review today (new ones included), oldest due first, new ones last in note order. */
export function dueCards(subjects: Subject[], today = isoDate(), only?: string): DueCard[] {
  const out: DueCard[] = [];
  for (const s of subjects) {
    if (only && s.path !== only) continue;
    for (const n of s.notes)
      for (const card of n.cards) {
        const state = n.states.get(card.id);
        if (isDue(state, today)) out.push({ card, state, notePath: n.path, noteTitle: n.title, subject: s.path, subjectTitle: s.title });
      }
  }
  const key = (d: DueCard) => d.state?.due ?? "9999";
  return out.sort((a, b) => key(a).localeCompare(key(b)));
}

export const cardCount = (s: Subject) => s.notes.reduce((n, x) => n + x.cards.length, 0);

/** Where to go on: the last material opened that still has a chapter to read. */
export function continueAt(subjects: Subject[]): { subject: Subject; material: Material; chapter: Chapter } | null {
  let best: { subject: Subject; material: Material; chapter: Chapter } | null = null;
  for (const s of subjects) {
    if (s.course && s.result !== "taking") continue;
    for (const m of s.materials) {
      const ch = m.at === null ? undefined : m.chapters.find(c => c.n === m.at);
      if (!ch || progress(m).read === m.chapters.length) continue;
      if (!best || m.modified > best.material.modified) best = { subject: s, material: m, chapter: ch };
    }
  }
  return best;
}

// ---- Loading, with a cache: handouts are big and the app reloads after every save. ----

type Parsed = { mtime: number; size: number; value: unknown };
const caches = new WeakMap<Notes, Map<string, Parsed>>();

async function loadCached<T>(notes: Notes, path: string, info: FileInfo, make: (n: Note) => T): Promise<T> {
  let cache = caches.get(notes);
  if (!cache) caches.set(notes, (cache = new Map()));
  const hit = cache.get(path);
  if (hit && hit.mtime === info.mtime && hit.size === info.size) return hit.value as T;
  const value = make(await notes.load(path));
  cache.set(path, { mtime: info.mtime, size: info.size, value });
  return value;
}

async function loadAll<T>(notes: Notes, dir: string, make: (n: Note) => T, onError?: (p: string) => void): Promise<T[]> {
  const out: T[] = [];
  for (const f of await notes.storage.list(dir)) {
    if (f.isDir || !f.name.endsWith(".md")) continue;
    try {
      out.push(await loadCached(notes, `${dir}/${f.name}`, f, make));
    } catch {
      onError?.(`${dir}/${f.name}`);
    }
  }
  return out;
}

/** Every subject with its materials and notes, last changed first. */
export async function loadSubjects(notes: Notes, onError?: (path: string) => void): Promise<Subject[]> {
  const out: Subject[] = [];
  for (const f of await notes.storage.list("study")) {
    if (!f.isDir || f.name.startsWith("_")) continue;
    const dir = `study/${f.name}`;
    const path = `${dir}/${SUBJECT_FILE}`;
    let n: Note;
    try {
      if (!(await notes.exists(path))) continue;
      n = await notes.load(path);
    } catch {
      onError?.(path);
      continue;
    }
    const materials = (await loadAll(notes, `${dir}/materials`, toMaterial, onError)).sort((a, b) =>
      a.title.localeCompare(b.title, undefined, { numeric: true }),
    );
    const studyNotes = (await loadAll(notes, `${dir}/notes`, toStudyNote, onError)).sort(
      (a, b) => a.created.localeCompare(b.created) || a.path.localeCompare(b.path),
    );
    const linksInfo = await notes.storage.stat(`${dir}/${LINKS_FILE}`);
    const links = linksInfo ? await loadCached(notes, `${dir}/${LINKS_FILE}`, linksInfo, x => parseLinks(x.body)).catch(() => []) : [];
    const d = n.data;
    const course = str(d.course);
    const assignments = course ? await loadAssignments(notes.storage, notes, dir, onError) : [];
    const exams = course
      ? (await loadAll(notes, `${dir}/exams`, toExam, onError)).sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"))
      : [];
    const modified = [str(d.modified ?? d.created), ...materials.map(m => m.modified), ...studyNotes.map(x => x.modified)].sort().at(-1)!;
    out.push({
      path,
      dir,
      slug: f.name,
      title: str(d.title) || f.name,
      group: str(d.group),
      parent: str(d.parent),
      exam: str(d.exam).slice(0, 10),
      course,
      semester: int(d.semester),
      teacher: str(d.teacher),
      room: str(d.room),
      hoursWeek: num(d.hours_week),
      hoursTotal: num(d.hours_total),
      schedule: slotsOf(d.schedule),
      result: pick(d.result, CLASS_RESULTS, "taking"),
      absences: Math.max(0, num(d.absences) ?? 0),
      assignments,
      exams,
      hasSummary: n.body.trim() !== "",
      materials,
      notes: studyNotes,
      links,
      modified,
    });
  }
  return out.sort((a, b) => b.modified.localeCompare(a.modified) || a.path.localeCompare(b.path));
}

export const groupsOf = (subjects: Subject[]) => [...new Set(subjects.map(s => s.group).filter(Boolean))].sort((a, b) => a.localeCompare(b));

// ---- Changes ----

export async function createSubject(
  notes: Notes,
  fields: { title: string; group?: string; parent?: string; course?: string; semester?: number },
): Promise<Note> {
  const dir = await notes.freePath("study", slugify(fields.title), "");
  const data: Data = {
    type: "subject",
    title: fields.title.trim(),
    group: fields.group?.trim() || undefined,
    parent: fields.parent || undefined,
    course: fields.course || undefined,
    semester: fields.course ? fields.semester : undefined,
    result: fields.course ? "taking" : undefined,
  };
  return notes.create(`${dir}/${SUBJECT_FILE}`, data, "");
}

export const isSchool = (s: Subject) => s.course !== "";

/** Children of a subject in the personal tree (parent = the subject's folder name). */
export const childrenOf = (subjects: Subject[], slug: string) => subjects.filter(s => !isSchool(s) && s.parent === slug);

/**
 * Personal subjects at the top of the tree: no parent, or a parent that no longer exists
 * (or would make a loop), so nothing is ever hidden.
 */
export function rootsOf(subjects: Subject[]): Subject[] {
  const personal = subjects.filter(s => !isSchool(s));
  const by = new Map(personal.map(s => [s.slug, s]));
  const reachesRoot = (s: Subject) => {
    const seen = new Set<string>();
    for (let x: Subject | undefined = s; x; x = by.get(x.parent)) {
      if (seen.has(x.slug)) return false;
      seen.add(x.slug);
      if (!x.parent || !by.has(x.parent)) return true;
    }
    return true;
  };
  return personal.filter(s => !s.parent || !by.has(s.parent) || !reachesRoot(s));
}

/** Slugs of a subject and everything under it (a subject cannot get one of these as parent). */
export function descendantsOf(subjects: Subject[], slug: string): Set<string> {
  const out = new Set([slug]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const s of subjects) if (!out.has(s.slug) && out.has(s.parent)) (out.add(s.slug), (grew = true));
  }
  return out;
}

/**
 * Text brought in as a material (an imported .md file or pasted text). A header it already has
 * is read for the title and left out of the body; the title is otherwise the first "# " heading,
 * then the file name.
 */
export function importText(text: string, fileName = ""): { title: string; body: string } {
  const p = parse(text.replace(/\r\n/g, "\n"));
  const title = str(p.data.title ?? p.data.titulo).trim() || titleOf(p.body) || fileName.replace(/\.(md|markdown|txt)$/i, "");
  return { title, body: p.body.replace(/^\s*\n/, "") };
}

export async function createMaterial(
  notes: Notes,
  subjectDir: string,
  fields: { title: string; kind: MaterialKind; source?: string; url?: string; body?: string },
): Promise<Note> {
  const path = await notes.freePath(`${subjectDir}/materials`, slugify(fields.title, 60));
  const data: Data = {
    type: "material",
    title: fields.title.trim(),
    kind: fields.kind,
    source: fields.source?.trim() || undefined,
    url: fields.url?.trim() || undefined,
  };
  return notes.create(path, data, fields.body ?? "");
}

/** Header change for a chapter marked read or unread. */
export function donePatch(done: number[], n: number, on: boolean): Data {
  const next = on ? [...new Set([...done, n])].sort((a, b) => a - b) : done.filter(x => x !== n);
  return { done: next.length ? next : undefined };
}

export async function createStudyNote(
  notes: Notes,
  subjectDir: string,
  about?: { material?: string; chapter?: number; title?: string; kind?: StudyNoteKind; date?: string },
  at = new Date(),
): Promise<Note> {
  const data: Data = {
    type: "study-note",
    kind: about?.kind && about.kind !== "note" ? about.kind : undefined,
    date: about?.date,
    material: about?.material || undefined,
    chapter: about?.chapter,
  };
  const body = about?.title ? `# ${about.title}\n\n` : "";
  return notes.create(await notes.freePath(`${subjectDir}/notes`, stamp(at)), data, body);
}

export interface NewCard {
  front: string;
  back: string;
  /** Also asked the other way round (":::" / "??"). */
  both?: boolean;
}

/** A card written in the note syntax (data/cards): one line when both sides are one line. */
export function cardText(c: NewCard): string {
  const front = c.front.trim();
  const back = c.back.trim();
  if (!front.includes("\n") && !back.includes("\n")) return `${front} ${c.both ? ":::" : "::"} ${back}`;
  const clean = (x: string) => x.replace(/\n\s*\n+/g, "\n");
  return `${clean(front)}\n${c.both ? "??" : "?"}\n${clean(back)}`;
}

/**
 * Adds cards to a subject's flashcard note: "Flashcards" for cards made by hand, or one note per
 * material for cards made from it. The note is created on first use. Returns its path.
 */
export async function appendCards(
  notes: Notes,
  subjectDir: string,
  cards: NewCard[],
  from?: { material: string; title: string },
): Promise<string> {
  const name = from ? `cards-${from.material}` : "flashcards";
  const path = `${subjectDir}/notes/${name}.md`;
  const lines = cards.filter(c => c.front.trim() && c.back.trim()).map(cardText);
  if (await notes.exists(path)) {
    const n = await notes.load(path);
    const body = n.body.replace(/\s*$/, "");
    await notes.save(n, n.data, `${body}\n\n${lines.join("\n\n")}\n`);
  } else {
    const title = from ? `Flashcards: ${from.title}` : "Flashcards";
    const data: Data = { type: "study-note", kind: "cards", material: from?.material };
    await notes.create(path, data, `# ${title}\n\n${lines.join("\n\n")}\n`);
  }
  return path;
}

// ---- [[Links]] between study notes ----

/** Names inside [[…]] in a text, outside code; "[[Name|shown text]]" and "[[Name#part]]" give Name. */
export function linksIn(body: string): string[] {
  const out: string[] = [];
  let fence = false;
  for (const line of body.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    if (fence) continue;
    for (const m of line.replace(/`[^`]*`/g, "").matchAll(/\[\[([^\[\]\n]+)\]\]/g)) {
      const name = m[1].split("|")[0].split("#")[0].trim();
      if (name) out.push(name);
    }
  }
  return out;
}

const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();

export type LinkTarget =
  | { kind: "subject"; path: string; title: string }
  | { kind: "material"; path: string; title: string }
  | { kind: "note"; path: string; title: string };

/** Everything a [[link]] can point to, the given subject's own items first. */
export function linkTargets(subjects: Subject[], first?: string): LinkTarget[] {
  const order = [...subjects].sort((a, b) => Number(b.dir === first) - Number(a.dir === first));
  const out: LinkTarget[] = [];
  for (const s of order) {
    for (const n of s.notes) if (n.title) out.push({ kind: "note", path: n.path, title: n.title });
    for (const m of s.materials) out.push({ kind: "material", path: m.path, title: m.title });
  }
  for (const s of order) out.push({ kind: "subject", path: s.path, title: s.title });
  return out;
}

/** What [[name]] opens: notes first, then materials, then subjects; the current subject wins ties. */
export function resolveLink(subjects: Subject[], name: string, fromDir?: string): LinkTarget | null {
  const key = fold(name);
  return linkTargets(subjects, fromDir).find(x => fold(x.title) === key) ?? null;
}

/** Study notes that link to a title (backlinks). */
export function backlinks(subjects: Subject[], title: string, except?: string): StudyNote[] {
  const key = fold(title);
  if (!key) return [];
  return subjects.flatMap(s => s.notes.filter(n => n.path !== except && n.links.some(x => fold(x) === key)));
}

/**
 * Saves a card's review state in its note (undefined clears it). States of cards no longer in
 * the note are dropped. `modified` is not touched: reviewing is not editing. Returns the old state
 * for Undo.
 */
export async function setCardState(notes: Notes, path: string, id: string, state: CardState | undefined): Promise<CardState | undefined> {
  const n = await notes.load(path);
  const ids = new Set(parseCards(n.body).map(c => c.id));
  const states = statesOf(n.data);
  const old = states.get(id);
  if (state) states.set(id, state);
  else states.delete(id);
  const cards: Record<string, string> = {};
  for (const [k, s] of states) if (ids.has(k)) cards[k] = writeState(s);
  await notes.save(n, { ...n.data, cards: Object.keys(cards).length ? cards : undefined }, n.body, { touch: false });
  return old;
}
