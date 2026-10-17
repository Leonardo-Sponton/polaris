import { isoDate, slugify, stamp } from "./dates";
import { flowOf, type Flow, type FlowId, type FlowStep } from "./flows";
import { titleOf, type Data } from "./frontmatter";
import { sectionsOf } from "./ideas";
import type { Note, Notes } from "./notes";
import { joinTitle, type Task } from "./todo";

// Projects (SPEC 3.3, 5.5): one folder per project, projects/<slug>/project.md with the flow,
// the current step and the gate history in the header, the title as "# Title" and free notes in
// the body. Each step of the flow is a sub-folder (named by the step id) holding that step's
// notes, created when its first note is written.

export type ProjectStatus = "active" | "on-hold" | "done" | "killed";

export const STATUSES: { id: ProjectStatus; label: string }[] = [
  { id: "active", label: "Active" },
  { id: "on-hold", label: "On hold" },
  { id: "done", label: "Done" },
  { id: "killed", label: "Killed" },
];

export const PROJECT_FILE = "project.md";

export interface Project {
  /** projects/<slug>/project.md */
  path: string;
  /** projects/<slug> */
  dir: string;
  slug: string;
  note: Note;
  title: string;
  status: ProjectStatus;
  flow: Flow;
  /** The current step (the first one when the header names none or an unknown one). */
  step: FlowStep;
  /** Path of the idea it came from, if any. */
  idea?: string;
  /** Decisions taken at the end of steps, oldest first. */
  gates: Gate[];
  created: string;
  modified: string;
}

const str = (v: unknown) => (v === undefined || v === null ? "" : String(v));
const pick = <T extends string>(value: unknown, list: { id: T }[], fallback: T): T =>
  list.some(x => x.id === value) ? (value as T) : fallback;

export const dirOf = (path: string) => path.slice(0, path.lastIndexOf("/"));
export const isProjectPath = (path: string) => /^projects\/[^/]+\/project\.md$/.test(path);
/** projects/<slug>/<step>/<file>.md */
export const isStepNotePath = (path: string) => /^projects\/[^/]+\/[^/]+\/[^/]+\.md$/.test(path);
/** projects/a/02-x/note.md → projects/a/project.md */
export const projectPathOf = (path: string) => `${path.split("/").slice(0, 2).join("/")}/${PROJECT_FILE}`;
/** projects/a/02-x/note.md → 02-x */
export const stepIdOf = (notePath: string) => notePath.split("/")[2];

export function toProject(note: Note): Project {
  const d = note.data;
  const dir = dirOf(note.path);
  const flow = flowOf(d.flow);
  const idea = str(d.idea);
  return {
    path: note.path,
    dir,
    slug: dir.slice("projects/".length),
    note,
    title: titleOf(note.body),
    status: pick(d.status, STATUSES, "active"),
    flow,
    step: flow.steps.find(s => s.id === d.step) ?? flow.steps[0],
    idea: idea && !idea.includes("/") ? `ideas/${idea}.md` : undefined,
    gates: gatesOf(d),
    created: str(d.created),
    modified: str(d.modified ?? d.created),
  };
}

/** Every project, last changed first. A folder without project.md is skipped. */
export async function loadProjects(notes: Notes, onError?: (path: string) => void): Promise<Project[]> {
  const out: Project[] = [];
  for (const f of await notes.storage.list("projects")) {
    if (!f.isDir) continue;
    const path = `projects/${f.name}/${PROJECT_FILE}`;
    if (!(await notes.exists(path))) continue;
    try {
      out.push(toProject(await notes.load(path)));
    } catch {
      onError?.(path);
    }
  }
  return out.sort((a, b) => b.modified.localeCompare(a.modified) || a.path.localeCompare(b.path));
}

/**
 * A new project on the first step of its flow. From an idea, the idea is marked "Became project"
 * and linked both ways (idea `project:` = folder name, project `idea:` = idea file name).
 */
export async function createProject(notes: Notes, fields: { title: string; flow: FlowId; idea?: string }): Promise<Note> {
  const dir = await notes.freePath("projects", slugify(fields.title), "");
  const flow = flowOf(fields.flow);
  const data: Data = {
    type: "project",
    status: "active",
    flow: flow.id,
    idea: fields.idea ? fields.idea.split("/").pop()!.replace(/\.md$/, "") : undefined,
    step: flow.steps[0].id,
  };
  const n = await notes.create(`${dir}/${PROJECT_FILE}`, data, joinTitle(fields.title, ""));
  if (fields.idea) await notes.patchHeader(fields.idea, { status: "project", project: dir.slice("projects/".length) });
  return n;
}

/** The flow an idea's template suggests. */
export const flowForTemplate = (template: string): FlowId => (template === "business" ? "business" : "software");

// ---- Step notes ----

export interface StepNote {
  /** projects/<slug>/<step>/<stamp>-<slug>.md */
  path: string;
  step: string;
  note: Note;
  title: string;
  created: string;
  modified: string;
}

export function toStepNote(note: Note): StepNote {
  return {
    path: note.path,
    step: stepIdOf(note.path),
    note,
    title: titleOf(note.body),
    created: str(note.data.created),
    modified: str(note.data.modified ?? note.data.created),
  };
}

/** The notes of every step folder of a project, in creation order (SPEC 5.5). */
export async function loadStepNotes(notes: Notes, dir: string): Promise<StepNote[]> {
  const out: StepNote[] = [];
  for (const f of await notes.storage.list(dir)) {
    if (!f.isDir) continue;
    for (const n of await notes.loadDir(`${dir}/${f.name}`)) out.push(toStepNote(n));
  }
  return out.sort((a, b) => a.created.localeCompare(b.created) || a.path.localeCompare(b.path));
}

/**
 * Step folders that are not in the project's flow (made by hand, or left from an older flow),
 * so their notes are still shown.
 */
export function extraSteps(flow: Flow, list: StepNote[]): string[] {
  return [...new Set(list.map(n => n.step))].filter(id => !flow.steps.some(s => s.id === id)).sort();
}

export async function createStepNote(notes: Notes, dir: string, step: string, title: string, now = new Date()) {
  const path = await notes.freePath(`${dir}/${step}`, `${stamp(now)}-${slugify(title)}`);
  return notes.create(path, { type: "step-note" }, joinTitle(title, ""));
}

/** Suggested sections of the step that the note does not have yet. */
export function missingStepSections(sections: string[], body: string): string[] {
  const have = new Set(sectionsOf(body).map(s => s.toLowerCase()));
  return sections.filter(s => !have.has(s.toLowerCase()));
}

/** Position of a step in the flow, from 1; 0 for a step not in the flow. */
export const stepNumber = (flow: Flow, id: string) => flow.steps.findIndex(s => s.id === id) + 1;

// ---- Gates (SPEC 5.5, Stage-Gate) ----

export type Decision = "go" | "hold" | "kill" | "recycle";

export const DECISIONS: { id: Decision; label: string; hint: string }[] = [
  { id: "go", label: "Go", hint: "The step is done: move on to the next one." },
  { id: "hold", label: "Hold", hint: "Pause the project; resume it later on the same step." },
  { id: "kill", label: "Kill", hint: "Stop the project for good. Say why." },
  { id: "recycle", label: "Recycle", hint: "Go back to an earlier step and redo it." },
];

export interface Gate {
  /** The step the decision closed. */
  step: string;
  decision: Decision;
  reason: string;
  date: string;
  /** Recycle: the step the project went back to. */
  to?: string;
}

export function gatesOf(d: Data): Gate[] {
  if (!Array.isArray(d.gates)) return [];
  return d.gates
    .filter((g): g is Record<string, unknown> => !!g && typeof g === "object")
    .map(g => ({
      step: str(g.step),
      decision: pick(g.decision, DECISIONS, "go"),
      reason: str(g.reason),
      date: str(g.date),
      ...(g.to ? { to: str(g.to) } : {}),
    }));
}

/**
 * The header change for a decision on the current step. Go moves to the next step (on the last
 * step it finishes the project), hold pauses it, kill ends it (a reason is required), recycle goes
 * back to an earlier step. Every decision is added to the gate history.
 */
export function gatePatch(p: Project, decision: Decision, reason: string, to?: string, now = new Date()): Data {
  const why = reason.trim();
  if (decision === "kill" && !why) throw new Error("Say why the project is killed.");
  const at = p.flow.steps.indexOf(p.step);
  const gate: Gate = { step: p.step.id, decision, reason: why, date: isoDate(now) };
  const patch: Data = {};
  switch (decision) {
    case "go": {
      const next = p.flow.steps[at + 1];
      if (next) Object.assign(patch, { status: "active", step: next.id });
      else patch.status = "done";
      break;
    }
    case "hold":
      patch.status = "on-hold";
      break;
    case "kill":
      patch.status = "killed";
      break;
    case "recycle": {
      const back = p.flow.steps.findIndex(s => s.id === to);
      if (back < 0 || back >= at) throw new Error("Pick an earlier step to go back to.");
      Object.assign(patch, { status: "active", step: to });
      gate.to = to;
      break;
    }
  }
  const { to: _t, ...plain } = gate;
  patch.gates = [...p.gates.map(g => ({ ...g })), gate.to ? gate : plain];
  return patch;
}

/** Steps a recycle can go back to: the ones before the current step. */
export const earlierSteps = (p: Project) => p.flow.steps.slice(0, p.flow.steps.indexOf(p.step));

// ---- Project tasks ----

/** Tasks of one project (or of one of its steps), in the order given. */
export function projectTasks(tasks: Task[], slug: string, step?: string): Task[] {
  return tasks.filter(t => t.project === slug && (step === undefined || t.step === step));
}
