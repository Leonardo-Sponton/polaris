import { describe, expect, it } from "vitest";
import { MemoryStorage } from "../src/storage/memory";
import { Notes } from "../src/data/notes";
import { FLOWS, flowOf } from "../src/data/flows";
import { createIdea, toIdea } from "../src/data/ideas";
import {
  createProject,
  createStepNote,
  earlierSteps,
  extraSteps,
  gatePatch,
  gatesOf,
  loadProjects,
  loadStepNotes,
  missingStepSections,
  projectPathOf,
  projectTasks,
  stepIdOf,
  toProject,
} from "../src/data/projects";
import { toTask } from "../src/data/todo";

describe("flows", () => {
  it("ships Business (6 steps from the Plano de Voo) and Software (8 steps)", () => {
    expect(FLOWS.map(f => [f.id, f.steps.length])).toEqual([
      ["business", 6],
      ["software", 8],
    ]);
    for (const f of FLOWS) {
      expect(new Set(f.steps.map(s => s.id)).size).toBe(f.steps.length);
      for (const s of f.steps) {
        expect(s.id).toMatch(/^\d\d-[a-z0-9-]+$/);
        expect(s.name && s.guidance).toBeTruthy();
      }
    }
    expect(flowOf("business").steps[0].id).toBe("00-integrating-environment");
    expect(flowOf("odd").id).toBe("software");
  });
});

describe("projects", () => {
  it("creates a folder on the first step and links the idea both ways", async () => {
    const notes = new Notes(new MemoryStorage());
    const idea = await createIdea(notes, "My app", "software", new Date(2026, 9, 17));
    const n = await createProject(notes, { title: "My app", flow: "software", idea: idea.path });
    expect(n.path).toBe("projects/my-app/project.md");
    expect(n.data).toMatchObject({ type: "project", status: "active", flow: "software", step: "01-discovery", idea: "20261017-my-app" });
    expect(n.body).toBe("# My app\n");
    const i = toIdea(await notes.load(idea.path));
    expect(i).toMatchObject({ status: "project", project: "my-app" });

    const [p] = await loadProjects(notes);
    expect(p).toMatchObject({ slug: "my-app", dir: "projects/my-app", title: "My app", idea: idea.path });
    expect(p.step.name).toBe("Discovery");
    const again = await createProject(notes, { title: "My app", flow: "business" });
    expect(again.path).toBe("projects/my-app-2/project.md");
    expect(again.data.idea).toBeUndefined();
  });

  it("reads hand-written headers safely", async () => {
    const s = new MemoryStorage();
    await s.write("projects/x/project.md", "---\ntype: project\nstatus: odd\nflow: business\nstep: 99-nope\nidea: ../etc\n---\n# X\n");
    await s.write("projects/empty/notes.txt", "no project.md");
    const [p] = await loadProjects(new Notes(s));
    expect(p).toMatchObject({ status: "active", title: "X", idea: undefined });
    expect(p.step.id).toBe("00-integrating-environment");
  });

  it("keeps step notes in step folders, in creation order", async () => {
    const s = new MemoryStorage();
    const notes = new Notes(s);
    const p = await createProject(notes, { title: "P", flow: "software" });
    const dir = "projects/p";
    const b = await createStepNote(notes, dir, "02-lean-canvas", "Canvas", new Date(2026, 9, 18, 9));
    const a = await createStepNote(notes, dir, "01-discovery", "Interviews", new Date(2026, 9, 17, 9));
    expect(a.path).toBe("projects/p/01-discovery/20261017-090000-interviews.md");
    expect(a.data.type).toBe("step-note");
    await s.write("projects/p/99-misc/x.md", "---\ntype: step-note\ncreated: 2026-01-01T00:00\n---\n# Old\n");
    const list = await loadStepNotes(notes, dir);
    // Same minute: by path, so by step and then by the time in the file name.
    expect(list.map(n => n.title)).toEqual(["Old", "Interviews", "Canvas"]);
    expect(list.find(n => n.title === "Interviews")!.step).toBe("01-discovery");
    expect(extraSteps(flowOf("software"), list)).toEqual(["99-misc"]);
    expect(projectPathOf(b.path)).toBe(p.path);
    expect(stepIdOf(b.path)).toBe("02-lean-canvas");
  });

  it("suggests the step's sections the note does not have yet", () => {
    const step = flowOf("software").steps[2];
    expect(missingStepSections(step.sections, "# R\n\n## must HAVE\n")).toEqual(["User stories", "Should have", "Could have", "Won't have"]);
    expect(missingStepSections([], "")).toEqual([]);
  });
});

describe("gates", () => {
  const make = async (step?: string) => {
    const notes = new Notes(new MemoryStorage());
    const n = await createProject(notes, { title: "G", flow: "software" });
    if (step) await notes.patchHeader(n.path, { step });
    return { notes, path: n.path, p: async () => toProject(await notes.load(n.path)) };
  };
  const day = new Date(2026, 9, 20);

  it("go moves to the next step and logs the gate; on the last step the project is done", async () => {
    const g = await make();
    await g.notes.patchHeader(g.path, gatePatch(await g.p(), "go", " 3 interviews ", undefined, day));
    let p = await g.p();
    expect(p.step.id).toBe("02-lean-canvas");
    expect(p.status).toBe("active");
    expect(p.gates).toEqual([{ step: "01-discovery", decision: "go", reason: "3 interviews", date: "2026-10-20" }]);

    const last = flowOf("software").steps.at(-1)!.id;
    await g.notes.patchHeader(g.path, { step: last });
    await g.notes.patchHeader(g.path, gatePatch(await g.p(), "go", "", undefined, day));
    p = await g.p();
    expect(p).toMatchObject({ status: "done" });
    expect(p.step.id).toBe(last);
    expect(p.gates).toHaveLength(2);
  });

  it("hold pauses, kill needs a reason, recycle goes back to an earlier step only", async () => {
    const g = await make("03-requirements");
    const q = await g.p();
    expect(gatePatch(q, "hold", "", undefined, day)).toMatchObject({ status: "on-hold" });
    expect(() => gatePatch(q, "kill", "  ")).toThrow();
    expect(gatePatch(q, "kill", "No market", undefined, day)).toMatchObject({ status: "killed" });
    expect(() => gatePatch(q, "recycle", "x", "04-mvp-scope")).toThrow();
    expect(() => gatePatch(q, "recycle", "x", "03-requirements")).toThrow();
    await g.notes.patchHeader(g.path, gatePatch(await g.p(), "recycle", "Wrong users", "01-discovery", day));
    const p = await g.p();
    expect(p.step.id).toBe("01-discovery");
    expect(p.gates[0]).toEqual({ step: "03-requirements", decision: "recycle", reason: "Wrong users", date: "2026-10-20", to: "01-discovery" });
    expect(earlierSteps(p)).toEqual([]);
  });

  it("reads odd gate lists safely", () => {
    expect(gatesOf({ gates: "x" })).toEqual([]);
    expect(gatesOf({ gates: [null, { step: "a", decision: "odd" }] })).toEqual([{ step: "a", decision: "go", reason: "", date: "" }]);
  });
});

describe("project tasks", () => {
  it("reads project and step from a task and filters by them", () => {
    const t = (data: Record<string, unknown>, i: number) =>
      toTask({ path: `todo/${i}.md`, data: { type: "todo", ...data }, body: "# T\n" } as never);
    const list = [t({ project: "a", step: "01-discovery" }, 1), t({ project: "a" }, 2), t({ step: "01-discovery" }, 3)];
    expect(list.map(x => [x.project, x.step])).toEqual([["a", "01-discovery"], ["a", undefined], [undefined, undefined]]);
    expect(projectTasks(list, "a").length).toBe(2);
    expect(projectTasks(list, "a", "01-discovery").map(x => x.path)).toEqual(["todo/1.md"]);
  });
});
