import type { Data } from "./frontmatter";
import { word } from "../i18n";
import type { Note, Notes } from "./notes";
import { dayOfPath, INTENTIONS } from "./journal";

export { reviewPath } from "./journal";

// Review, the evening examination (SPEC 5.8): one file per day, review/YYYY-MM-DD.md, written
// only when the day has something. Header: `virtues`, `develop`, `thought`. Body: one "## "
// section per question, in the order below; empty sections are not written. Text before the
// first section and sections with other names are kept as they are.

export interface Question {
  /** The English heading, also the key of the answer and of its words in i18n (review.questions). */
  title: string;
  /** The Portuguese heading (written when the app is in Portuguese; both are read). */
  pt: string;
  /** A short text from the tradition, with the built-in thought it comes from (data/thoughts.json).
   *  Who says it is in i18n (review.leads). */
  support?: { text: string; thought: string };
}

// The supporting quotes are the built-in thoughts sen-ira-3-36a/b (Aubrey Stewart's translation
// of De Ira III.36) and ept-man-1 (George Long's Enchiridion 1), checked verbatim in stage 4a.
export const QUESTIONS: Question[] = [
  { title: "Gratitude", pt: "Gratidão" },
  { title: "Done well", pt: "O que fiz bem", support: { text: "…in what respect are you better?", thought: "sen-ira-3-36a" } },
  {
    title: "Difficulties",
    pt: "Dificuldades",
    support: { text: "What bad habit of yours have you cured to-day? what vice have you checked?", thought: "sen-ira-3-36a" },
  },
  { title: "Up to me", pt: "Depende de mim", support: { text: "Of things some are in our power, and others are not.", thought: "ept-man-1" } },
  { title: "Not up to me", pt: "Não depende de mim" },
  { title: "Virtues", pt: "Virtudes" },
  { title: "Repair", pt: "Reparar", support: { text: "I pardon you this time: see that you never do that any more.", thought: "sen-ira-3-36b" } },
  { title: INTENTIONS.en, pt: INTENTIONS.pt },
];

/** The heading of a question in the app's language. */
export const heading = (q: Question) => word({ en: q.title, pt: q.pt });

export type Virtue = "wisdom" | "courage" | "justice" | "temperance";

/** The Stoic cardinal virtues; their names are in i18n (review.virtues). */
export const VIRTUES: { id: Virtue; color: string }[] = [
  { id: "wisdom", color: "cyan" },
  { id: "courage", color: "h1" },
  { id: "justice", color: "ok" },
  { id: "temperance", color: "h3" },
];

/** Known virtues from a header list, in the fixed order. */
export function virtuesOf(v: unknown): Virtue[] {
  const list = Array.isArray(v) ? v.map(x => String(x).toLowerCase()) : [];
  return VIRTUES.map(x => x.id).filter(id => list.includes(id));
}

export interface Parts {
  /** Text before the first section. */
  free: string;
  /** Answers by question title. */
  answers: Record<string, string>;
  /** Sections with other names, in file order. */
  extras: { title: string; text: string }[];
}

// Headings in either language lead to the question's key.
const known = new Map(QUESTIONS.flatMap(q => [[q.title.toLowerCase(), q.title], [q.pt.toLowerCase(), q.title]] as const));

export function splitReview(body: string): Parts {
  const parts: Parts = { free: "", answers: {}, extras: [] };
  let cur: { title: string | null; lines: string[] } = { title: null, lines: [] };
  const flush = () => {
    const text = cur.lines.join("\n").trim();
    if (cur.title === null) parts.free = text;
    else {
      const k = known.get(cur.title.toLowerCase());
      // A repeated known section is added to the first one, nothing is lost.
      if (k) parts.answers[k] = [parts.answers[k], text].filter(Boolean).join("\n\n");
      else parts.extras.push({ title: cur.title, text });
    }
  };
  for (const line of body.split("\n")) {
    const m = /^##[ \t]+(.+?)[ \t]*#*[ \t]*$/.exec(line);
    if (m) {
      flush();
      cur = { title: m[1].trim(), lines: [] };
    } else cur.lines.push(line);
  }
  flush();
  return parts;
}

/** Free text, then the questions in order, then the other sections; empty ones are left out. */
export function joinReview(p: Parts): string {
  const out: string[] = [];
  if (p.free.trim()) out.push(p.free.trim());
  for (const q of QUESTIONS) {
    const t = (p.answers[q.title] ?? "").trim();
    if (t) out.push(`## ${heading(q)}\n\n${t}`);
  }
  for (const x of p.extras) if (x.text.trim()) out.push(`## ${x.title}\n\n${x.text.trim()}`);
  return out.length ? out.join("\n\n") + "\n" : "";
}

/** Nothing written and no virtue marked. A picked thought alone does not keep the file. */
export const isEmptyReview = (body: string, data: Data) =>
  body.trim() === "" && !virtuesOf(data.virtues).length && !virtuesOf(data.develop).length;

export interface ReviewEntry {
  day: string;
  path: string;
  virtues: Virtue[];
  develop: Virtue[];
  /** First answer, for the list. */
  preview: string;
  /** How many questions have an answer. */
  answered: number;
}

export function toReviewEntry(note: Note): ReviewEntry {
  const p = splitReview(note.body);
  const first = QUESTIONS.map(q => p.answers[q.title]).find(Boolean) ?? p.free ?? p.extras[0]?.text ?? "";
  const line = first.split("\n").map(l => l.trim()).find(Boolean) ?? "";
  return {
    day: dayOfPath(note.path)!,
    path: note.path,
    virtues: virtuesOf(note.data.virtues),
    develop: virtuesOf(note.data.develop),
    preview: line.replace(/^(#+|>|[-*+]( \[[ xX]\])?|\d+\.)\s*/, "").replace(/[*_~`]/g, ""),
    answered: QUESTIONS.filter(q => (p.answers[q.title] ?? "").trim()).length,
  };
}

/** Every written review, newest first. Empty files are left out. */
export async function loadReviews(notes: Notes, onError?: (path: string) => void): Promise<ReviewEntry[]> {
  const list = await notes.loadDir("review", p => onError?.(p));
  return list
    .filter(n => dayOfPath(n.path) && !isEmptyReview(n.body, n.data))
    .map(toReviewEntry)
    .sort((a, b) => b.day.localeCompare(a.day));
}
